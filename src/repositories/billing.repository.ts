import { supabase } from '../config/supabase';
import { Invoice, CreateInvoiceDTO, InvoiceStatus, Payment, CreatePaymentDTO } from '../models/billing.model';

// ─── Invoice Repository ───────────────────────────────────────────────────────

export class InvoiceRepository {
    private readonly TABLE = 'invoices';

    async create(dto: CreateInvoiceDTO): Promise<Invoice> {
        // Extraer el código LNK_XXXXX desde la URL configurada
        const checkoutUrl = process.env['BOLD_CHECKOUT_URL'] || '';
        const match = checkoutUrl.match(/(LNK_[A-Z0-9]+)/);
        const boldLink = match ? match[1] : null;

        // Insert first to get the ID
        const { data, error } = await supabase
            .from(this.TABLE)
            .insert({
                clinic_id:      dto.clinic_id,
                owner_id:       dto.owner_id,
                appointment_id: dto.appointment_id ?? null,
                total_amount:   dto.total_amount,
                description:    dto.description ?? null,
                status:         dto.status ?? 'DRAFT',
                bold_link:      boldLink, // <── ¡Guardamos el bold_link aquí!
            })
            .select()
            .single();

        if (error) throw new Error(`Error creando factura: ${error.message}`);

        // Build human-readable reference from the generated UUID
        const reference = `INV-${(data.id as string).replace(/-/g, '').substring(0, 8).toUpperCase()}`;

        const { data: updated, error: refErr } = await supabase
            .from(this.TABLE)
            .update({ reference })
            .eq('id', data.id)
            .select()
            .single();

        if (refErr) throw new Error(`Error actualizando referencia: ${refErr.message}`);
        return updated as Invoice;
    }

    async findById(id: string): Promise<Invoice | null> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('id', id)
            .single();

        if (error) return null;
        return data as Invoice;
    }

    async findByOwner(ownerId: string): Promise<Invoice[]> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('owner_id', ownerId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(`Error listando facturas: ${error.message}`);
        return (data ?? []) as Invoice[];
    }

    async findByClinic(clinicId: string): Promise<Invoice[]> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(`Error listando facturas: ${error.message}`);
        return (data ?? []) as Invoice[];
    }

    async findByAppointment(appointmentId: string): Promise<Invoice | null> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('appointment_id', appointmentId)
            .maybeSingle();

        if (error) return null;
        return data as Invoice | null;
    }

    async findByReference(reference: string): Promise<Invoice | null> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('reference', reference)
            .maybeSingle();

        if (error) return null;
        return data as Invoice | null;
    }

    async findByTransactionId(transactionId: string): Promise<Invoice | null> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('transaction_id', transactionId)
            .maybeSingle();

        if (error) return null;
        return data as Invoice | null;
    }

    async findByBoldLink(link: string): Promise<Invoice | null> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('bold_link', link)
            .maybeSingle();

        if (error) return null;
        return data as Invoice | null;
    }

    async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Error actualizando factura: ${error.message}`);
        return data as Invoice;
    }

    /**
     * Persiste el transaction_id de Bold junto al nuevo estado de la factura.
     * Usado por el webhook handler al recibir SALE_APPROVED.
     */
    async updateStatusAndTransaction(
        id: string,
        status: InvoiceStatus,
        transactionId: string,
    ): Promise<Invoice> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .update({ status, transaction_id: transactionId })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Error actualizando factura con transacción: ${error.message}`);
        return data as Invoice;
    }
}

// ─── Payment Repository ───────────────────────────────────────────────────────

export class PaymentRepository {
    private readonly TABLE = 'payments';

    async create(dto: CreatePaymentDTO): Promise<Payment> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .insert({
                invoice_id: dto.invoice_id,
                amount:     dto.amount,
                reference:  dto.reference,
                currency:   dto.currency ?? 'COP',
                provider:   dto.provider ?? 'WOMPI',
                status:     'PENDING',
            })
            .select()
            .single();

        if (error) throw new Error(`Error creando pago: ${error.message}`);
        return data as Payment;
    }

    async findByReference(reference: string): Promise<Payment | null> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .select('*')
            .eq('reference', reference)
            .maybeSingle();

        if (error) return null;
        return data as Payment | null;
    }

    async updateFromWebhook(
        reference: string,
        status: 'SUCCESS' | 'FAILED',
        transactionId: string,
        wompiPayload: Record<string, unknown>
    ): Promise<Payment> {
        const { data, error } = await supabase
            .from(this.TABLE)
            .update({ status, transaction_id: transactionId, wompi_payload: wompiPayload })
            .eq('reference', reference)
            .select()
            .single();

        if (error) throw new Error(`Error actualizando pago: ${error.message}`);
        return data as Payment;
    }
}
