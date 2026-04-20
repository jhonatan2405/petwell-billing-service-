// ─── Invoice ──────────────────────────────────────────────────────────────────

export type InvoiceStatus =
    | 'DRAFT'
    | 'PENDING_PAYMENT'
    | 'PAYMENT_REPORTED'   // usuario reportó pago manualmente (fallback)
    | 'PAID'               // pago confirmado (por webhook Bold o aprobación manual)
    | 'REJECTED'           // pago rechazado por la clínica
    | 'CANCELLED';

export interface Invoice {
    id: string; // UUID
    clinic_id: string; // UUID
    owner_id: string; // UUID (pet owner)
    appointment_id?: string; // UUID
    total_amount: number;
    description?: string;
    reference?: string; // format INV-XXXX
    bold_link?: string; // format LNK_XXXX
    status: InvoiceStatus;
    transaction_id?: string; // ID assigned by external gateway
    created_at: string;
    updated_at: string;
}

export interface CreateInvoiceDTO {
    clinic_id: string;
    owner_id: string;
    appointment_id?: string;
    total_amount: number;
    description?: string;
    status?: InvoiceStatus;
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface Payment {
    id: string;
    invoice_id: string;
    provider: string;
    transaction_id?: string | null;
    reference?: string | null;
    amount: number;
    currency: string;
    status: PaymentStatus;
    wompi_payload?: Record<string, unknown> | null;
    created_at: string;
}

export interface CreatePaymentDTO {
    invoice_id: string;
    amount: number;
    reference: string;
    currency?: string;
    provider?: string;
}
