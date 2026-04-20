import { InvoiceRepository, PaymentRepository } from '../repositories/billing.repository';
import { Invoice, CreateInvoiceDTO } from '../models/billing.model';
import { env } from '../config/env';

const invoiceRepo = new InvoiceRepository();
const paymentRepo = new PaymentRepository();

// ─── Invoice Service ──────────────────────────────────────────────────────────

export class InvoiceService {

    async createInvoice(dto: CreateInvoiceDTO, requesterClinicId?: string): Promise<Invoice> {
        if (requesterClinicId && dto.clinic_id !== requesterClinicId) {
            throw Object.assign(new Error('Solo puedes crear facturas de tu propia clínica'), { statusCode: 403 });
        }
        if (!dto.total_amount || dto.total_amount <= 0) {
            throw Object.assign(new Error('El monto debe ser mayor a 0'), { statusCode: 400 });
        }
        return invoiceRepo.create(dto);
    }

    async getInvoices(role: string, userId: string, clinicId?: string): Promise<Invoice[]> {
        if (role === 'DUENO_MASCOTA') {
            return invoiceRepo.findByOwner(userId);
        }
        if (['CLINIC_ADMIN', 'VETERINARIO', 'RECEPCIONISTA'].includes(role) && clinicId) {
            return invoiceRepo.findByClinic(clinicId);
        }
        throw Object.assign(new Error('Sin permisos para listar facturas'), { statusCode: 403 });
    }

    async getInvoiceById(id: string, role: string, userId: string, clinicId?: string): Promise<Invoice> {
        const invoice = await invoiceRepo.findById(id);
        if (!invoice) throw Object.assign(new Error('Factura no encontrada'), { statusCode: 404 });

        if (role === 'DUENO_MASCOTA' && invoice.owner_id !== userId) {
            throw Object.assign(new Error('Sin acceso a esta factura'), { statusCode: 403 });
        }
        if (['CLINIC_ADMIN', 'VETERINARIO'].includes(role) && clinicId && invoice.clinic_id !== clinicId) {
            throw Object.assign(new Error('Sin acceso a esta factura'), { statusCode: 403 });
        }

        return invoice;
    }
}

// ─── Payment Service ──────────────────────────────────────────────────────────

export class PaymentService {

    /**
     * POST /api/v1/billing/payments/init
     *
     * Returns the Bold payment link URL built from env config + the invoice reference.
     * No API call to Bold is made — we just return the link and a pending payment record.
     */
    async initiatePayment(
        invoiceId: string,
        requesterId: string,
        requesterRole: string,
    ): Promise<{ redirect_url: string; reference: string }> {

        const invoice = await invoiceRepo.findById(invoiceId);
        if (!invoice) throw Object.assign(new Error('Factura no encontrada'), { statusCode: 404 });

        if (requesterRole === 'DUENO_MASCOTA' && invoice.owner_id !== requesterId) {
            throw Object.assign(new Error('Sin acceso a esta factura'), { statusCode: 403 });
        }
        if (invoice.status === 'PAID') {
            throw Object.assign(new Error('Esta factura ya está pagada'), { statusCode: 400 });
        }
        if (invoice.status === 'CANCELLED') {
            throw Object.assign(new Error('Esta factura está cancelada'), { statusCode: 400 });
        }

        // reference was auto-generated when invoice was created (e.g. "INV-A1B2C3D4")
        const reference = invoice.reference ?? `INV-${invoice.id.replace(/-/g, '').substring(0, 8).toUpperCase()}`;

        // Build Bold payment link — no API key needed, just the configured link
        // Bold link format from dashboard: https://pay.bold.co/payment/<link-id>
        // Append our reference as a query param so the user can identify their payment
        const boldBase = env.BOLD_CHECKOUT_URL; // e.g. https://pay.bold.co/payment/abc123
        const redirect_url = `${boldBase}?reference=${encodeURIComponent(reference)}`;

        // Persist local payment record (idempotent — skip if already has a pending payment)
        const existing = await paymentRepo.findByReference(reference);
        if (!existing) {
            await paymentRepo.create({
                invoice_id: invoice.id,
                amount:     invoice.total_amount,
                reference,
                currency:   'COP',
                provider:   'BOLD',
            });
        }

        // Mark invoice as pending payment
        if (invoice.status === 'DRAFT') {
            await invoiceRepo.updateStatus(invoiceId, 'PENDING_PAYMENT');
        }

        console.log(`[Bold] Payment link generated for invoice ${invoiceId} | reference: ${reference}`);

        return { redirect_url, reference };
    }

    /**
     * POST /api/v1/billing/payments/confirm
     *
     * Called by the frontend after the user manually verifies their payment.
     * Validates invoice_id + reference match in the DB, then marks PAID and confirms appointment.
     */
    async confirmPayment(invoiceId: string, reference: string): Promise<void> {
        const invoice = await invoiceRepo.findById(invoiceId);
        if (!invoice) throw Object.assign(new Error('Factura no encontrada'), { statusCode: 404 });

        // Idempotent
        if (invoice.status === 'PAID') {
            console.log(`[Bold] Invoice ${invoiceId} already PAID — skipping`);
            return;
        }

        // Validate that the provided reference matches the invoice's own reference
        if (!invoice.reference || invoice.reference !== reference) {
            throw Object.assign(
                new Error('La referencia no coincide con la factura. Verifica el código e intenta de nuevo.'),
                { statusCode: 400 }
            );
        }

        // Mark payment as SUCCESS
        const payment = await paymentRepo.findByReference(reference);
        if (payment) {
            await paymentRepo.updateFromWebhook(reference, 'SUCCESS', reference, {});
        }

        // Mark invoice as PAID
        await invoiceRepo.updateStatus(invoiceId, 'PAID');
        console.log(`[Bold] Invoice ${invoiceId} confirmed PAID | ref: ${reference}`);

        // Notify appointment service (fire-and-forget)
        this.notifyAppointmentPaid(invoiceId).catch(e =>
            console.error('[Bold] Failed to notify appointment service:', e)
        );
    }

    /**
     * After payment confirmed, notify Appointment Service to CONFIRM the appointment.
     */
    private async notifyAppointmentPaid(invoiceId: string): Promise<void> {
        try {
            const invoice = await invoiceRepo.findById(invoiceId);
            if (!invoice?.appointment_id) return;

            const res = await fetch(
                `${env.APPOINTMENT_SERVICE_URL}/api/v1/appointments/${invoice.appointment_id}/confirm`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-internal-service-key': env.INTERNAL_SERVICE_KEY,
                    },
                }
            );

            if (!res.ok) {
                const body = await res.text();
                console.error(`[Bold] Appointment confirm returned ${res.status}: ${body}`);
            } else {
                console.log(`[Bold] Appointment ${invoice.appointment_id} confirmed`);
            }
        } catch (e) {
            console.error('[Bold] Error notifying appointment:', e);
        }
    }
}
