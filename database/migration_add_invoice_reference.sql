-- ============================================================
-- PetWell Billing — Migration: agregar campo reference a invoices
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS reference TEXT UNIQUE;

-- Generar referencia para facturas existentes que no la tengan
UPDATE invoices 
SET reference = 'INV-' || UPPER(SUBSTRING(id::text, 1, 8))
WHERE reference IS NULL;

COMMENT ON COLUMN invoices.reference IS 'Referencia humana legible para Bold Checkout (ej: INV-A1B2C3D4)';
