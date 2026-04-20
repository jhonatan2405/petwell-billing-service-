-- ============================================================
-- PetWell Billing — Migration: add bold_link mapping
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar bold_link a invoices
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS bold_link TEXT;

-- 2. Índice para búsquedas rápidas en webhooks
CREATE INDEX IF NOT EXISTS idx_invoices_bold_link ON invoices(bold_link);

-- 3. Documentación
COMMENT ON COLUMN invoices.bold_link IS 'Código del link de pago en Bold (ej: LNK_5JOH81QW4Y) recibido en webhooks';
