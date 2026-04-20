-- ============================================================
-- PetWell Billing — Migration: soporte Bold Webhooks
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Ampliar el CHECK constraint de invoices.status para incluir PAYMENT_REPORTED y REJECTED
--    (útil si en el futuro se agrega validación manual como fallback)
ALTER TABLE invoices
    DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE invoices
    ADD CONSTRAINT invoices_status_check
    CHECK (status IN (
        'DRAFT',
        'PENDING_PAYMENT',
        'PAYMENT_REPORTED',
        'PAID',
        'REJECTED',
        'CANCELLED'
    ));

-- 2. Asegurar que la columna reference exista y sea UNIQUE
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS reference TEXT;

UPDATE invoices
    SET reference = 'INV-' || UPPER(SUBSTRING(id::text, 1, 8))
WHERE reference IS NULL;

ALTER TABLE invoices
    DROP CONSTRAINT IF EXISTS invoices_reference_unique;

ALTER TABLE invoices
    ADD CONSTRAINT invoices_reference_unique UNIQUE (reference);

-- 3. Agregar transaction_id a invoices (para rastrear ID de transacción Bold)
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS transaction_id TEXT;

-- 4. Cambiar proveedor por defecto en payments de WOMPI a BOLD
-- (no altera datos existentes, solo documenta)
COMMENT ON COLUMN payments.provider IS 'Pasarela de pago: BOLD | WOMPI | MANUAL';

-- 5. Ampliar payments para guardar el payload completo del webhook de Bold
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS bold_payload JSONB;

-- 6. Índice en invoices.transaction_id para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_invoices_transaction_id ON invoices(transaction_id);

COMMENT ON COLUMN invoices.reference     IS 'Referencia humana para Bold Checkout (ej: INV-A1B2C3D4)';
COMMENT ON COLUMN invoices.transaction_id IS 'ID de transacción asignado por Bold al aprobar el pago';
