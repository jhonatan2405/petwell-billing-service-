import { InvoiceRepository, PaymentRepository } from '../repositories/billing.repository';
import { env } from '../config/env';

const invoiceRepo = new InvoiceRepository();
const paymentRepo = new PaymentRepository();

// ─── Bold Event Types ─────────────────────────────────────────────────────────

/**
 * Estructura del payload que Bold envía en el webhook.
 * Documentación: https://developers.bold.co/docs/webhooks
 */
interface BoldWebhookEvent {
    type: string;                   // e.g. "SALE_APPROVED" | "SALE_REJECTED"
    data: {
        payment_id?: string;        // ID interno de Bold
        amount?: number;
        currency?: string;
        status?: string;
        metadata?: {
            reference?: string;     // El INV-XXXX que enviamos al crear el link
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    timestamp?: string;
}

// ─── Webhook Service ──────────────────────────────────────────────────────────

export class WebhookService {

    /**
     * Procesa un evento entrante del webhook de Bold.
     *
     * IMPORTANTE: Este método NUNCA debe lanzar una excepción — Bold requiere
     * siempre recibir HTTP 200. Todos los errores se capturan internamente.
     *
     * @param event   Payload parseado del webhook
     * @returns       Log de acciones realizadas
     */
    async processEvent(event: BoldWebhookEvent): Promise<{ processed: boolean; message: string }> {
        console.log(`[WEBHOOK] Evento recibido: ${event.type}`, {
            payment_id: event.data?.payment_id,
            timestamp: event.timestamp,
        });

        // ── Solo procesamos SALE_APPROVED ────────────────────────────────────
        if (event.type !== 'SALE_APPROVED') {
            console.log(`[WEBHOOK] Tipo de evento ignorado: ${event.type}`);
            return { processed: false, message: `Evento ${event.type} ignorado` };
        }

        const data = event.data || {};
        
        // Loggear payload completo para facilitar debugging
        console.log('[WEBHOOK] Procesando payload completo:', JSON.stringify(event, null, 2));

        const paymentId = (data.payment_id ?? '') as string;
        
        if (paymentId) {
            console.log(`[WEBHOOK] payment_id recibido: ${paymentId}`);
        } else {
            console.log(`[WEBHOOK] Evento recibido sin payment_id explícito`);
        }

        try {
            let invoice = null;

            // 1. Intentar buscar primero por payment_id (transaction_id en BD)
            if (paymentId) {
                invoice = await invoiceRepo.findByTransactionId(paymentId);
                if (invoice) {
                    console.log(`[WEBHOOK] invoice encontrada por payment_id: ${invoice.id}`);
                }
            }

            // 2. Fallback: buscar por bold_link (en lugar de la ref antigua INV-XXXX)
            if (!invoice) {
                const link = 
                    (data.metadata?.reference as string | undefined) || 
                    (data.reference as string | undefined) || 
                    (data.order_id as string | undefined) || '';

                console.log("[WEBHOOK] link recibido:", link);

                if (link) {
                    console.log("[WEBHOOK] buscando por bold_link...");
                    invoice = await invoiceRepo.findByBoldLink(link);
                    console.log("[WEBHOOK] factura encontrada:", invoice?.id);
                }
            }

            if (!invoice) {
                console.warn(`[WEBHOOK] ⚠️  No se encontró factura por payment_id ni por bold_link`);
                return { processed: false, message: 'Factura no encontrada' };
            }

            // ── Idempotencia: si ya está PAID ─────────────────
            if (invoice.status === 'PAID') {
                console.log('[WEBHOOK] duplicado ignorado');
                return { processed: true, message: 'Factura ya pagada (idempotente)' };
            }

            const activeReference = invoice.reference ?? '';
            console.log(`[WEBHOOK] Pago aprobado | invoice_id: ${invoice.id} | payment_id: ${paymentId}`);

            // ── Actualizar factura: PAID + transaction_id ────────────────────
            await invoiceRepo.updateStatusAndTransaction(invoice.id, 'PAID', paymentId);
            console.log(`[WEBHOOK] Factura actualizada → PAID | id: ${invoice.id} | tx: ${paymentId}`);

            // ── Actualizar registro de pago existente (o crear si no existe) ──
            const existingPayment = await paymentRepo.findByReference(activeReference);
            if (existingPayment) {
                await paymentRepo.updateFromWebhook(activeReference, 'SUCCESS', paymentId, event.data);
                console.log(`[WEBHOOK] Registro de pago actualizado → SUCCESS`);
            } else {
                await paymentRepo.create({
                    invoice_id: invoice.id,
                    amount:     invoice.total_amount,
                    reference:  activeReference,
                    currency:   'COP',
                    provider:   'BOLD',
                });
                await paymentRepo.updateFromWebhook(activeReference, 'SUCCESS', paymentId, event.data);
                console.log(`[WEBHOOK] Nuevo registro de pago creado → SUCCESS`);
            }

            // ── Notificar al appointment-service (fire-and-forget) ────────────
            if (invoice.appointment_id) {
                this.confirmAppointment(invoice.appointment_id, invoice.id).catch(e =>
                    console.error('[WEBHOOK] Error al confirmar cita:', e)
                );
            } else {
                console.log('[WEBHOOK] Factura sin appointment_id — no se confirma cita');
            }

            return { processed: true, message: `Factura ${invoice.id} marcada PAID` };

        } catch (err) {
            // Capturar y loggear — NUNCA relanzar para no romper el webhook
            console.error('[WEBHOOK] ❌ Error procesando evento:', err);
            return { processed: false, message: `Error interno: ${(err as Error).message}` };
        }
    }

    /**
     * Llama al appointment-service para confirmar una cita tras el pago.
     * Usada en modo fire-and-forget.
     */
    private async confirmAppointment(appointmentId: string, invoiceId: string): Promise<void> {
        const url = `${env.APPOINTMENT_SERVICE_URL}/api/v1/appointments/${appointmentId}/confirm`;

        console.log(`[WEBHOOK] Confirmando cita ${appointmentId} → ${url}`);

        const res = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-service-key': env.INTERNAL_SERVICE_KEY,
            },
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Appointment service respondió ${res.status}: ${body}`);
        }

        console.log(`[WEBHOOK] ✅ Cita ${appointmentId} confirmada exitosamente (invoice: ${invoiceId})`);
    }
}
