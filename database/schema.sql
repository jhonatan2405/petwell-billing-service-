-- ============================================================
-- PetWell Billing Service – Schema
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Extensión UUID (ya activa en Supabase, pero por si acaso)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── invoices ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id        UUID        NOT NULL,
    owner_id         UUID        NOT NULL,
    appointment_id   UUID,
    total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','PENDING_PAYMENT','PAID','CANCELLED')),
    description      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_invoices_clinic_id        ON invoices(clinic_id);
CREATE INDEX IF NOT EXISTS idx_invoices_owner_id         ON invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_appointment_id   ON invoices(appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status           ON invoices(status);

-- ─── payments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id      UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL DEFAULT 'WOMPI',
    transaction_id  TEXT,
    reference       TEXT        UNIQUE,          -- referencia única enviada a Wompi
    amount          NUMERIC(10,2) NOT NULL,
    currency        VARCHAR(3)  NOT NULL DEFAULT 'COP',
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SUCCESS','FAILED')),
    wompi_payload   JSONB,                       -- respuesta completa del webhook
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id     ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference      ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);

-- ─── Trigger: actualizar updated_at en invoices ──────────────
CREATE OR REPLACE FUNCTION update_invoice_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invoice_updated_at ON invoices;
CREATE TRIGGER set_invoice_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_invoice_timestamp();
