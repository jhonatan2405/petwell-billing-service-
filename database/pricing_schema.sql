-- ============================================================
-- PetWell Billing Service – Precios por clínica
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS clinic_pricing (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id        UUID        NOT NULL UNIQUE,
    price_consulta   NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_telemedicina NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_urgencia   NUMERIC(10,2) NOT NULL DEFAULT 0,
    price_vacunacion NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_pricing_clinic_id ON clinic_pricing(clinic_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pricing_updated_at ON clinic_pricing;
CREATE TRIGGER set_pricing_updated_at
    BEFORE UPDATE ON clinic_pricing
    FOR EACH ROW EXECUTE FUNCTION update_pricing_timestamp();
