-- ============================================================
-- PetWell — Billing Service
-- Row Level Security (RLS) policies
-- Tables: invoices | payments | clinic_pricing
--
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql
-- y DESPUÉS de pricing_schema.sql
-- ============================================================
--
-- ⚠️  IMPORTANTE — Por qué esto es seguro para tus microservicios:
--
--   Los microservicios de PetWell se conectan a Supabase con la
--   clave SERVICE_ROLE (SUPABASE_SERVICE_ROLE_KEY).
--   El service role SIEMPRE bypassa RLS por diseño de Supabase.
--   → Ningún INSERT, UPDATE, webhook ni trigger existente se rompe.
--
--   Estas políticas solo afectan conexiones que usen:
--     • La clave ANON (acceso público)
--     • Tokens JWT de usuarios autenticados (frontend/PostgREST)
--
-- Claims JWT disponibles en este proyecto:
--   auth.uid()              → UUID del usuario (claim 'sub')
--   jwt_claim('role')       → DUENO_MASCOTA | CLINIC_ADMIN | VETERINARIO
--   jwt_claim('clinic_id')  → UUID de la clínica (null para DUENO_MASCOTA)
-- ============================================================

-- ─── Helper: leer claim JWT de forma segura ───────────────────────────────────
-- Si ya existe (creada por EHR Service RLS), el CREATE OR REPLACE la actualiza
-- sin conflicto.
CREATE OR REPLACE FUNCTION public.jwt_claim(claim TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> claim,
    ''
  );
$$ LANGUAGE sql STABLE;

-- ============================================================
-- TABLA 1: invoices
-- Reglas de acceso:
--   SELECT : CLINIC_ADMIN/VETERINARIO de su clínica
--            DUENO_MASCOTA solo sus propias facturas (owner_id)
--   INSERT : Solo CLINIC_ADMIN de su clínica
--            (el microservicio usa service_role → bypass RLS)
--   UPDATE : Solo CLINIC_ADMIN de su clínica
-- ============================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores para evitar duplicados
DROP POLICY IF EXISTS "invoices_select" ON invoices;
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
DROP POLICY IF EXISTS "invoices_update" ON invoices;

-- SELECT ─────────────────────────────────────────────────────
CREATE POLICY "invoices_select"
ON invoices FOR SELECT
USING (
  -- Personal de clínica: solo facturas de su clínica
  (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND public.jwt_claim('clinic_id')::uuid = clinic_id
  )
  -- Dueño de mascota: solo sus propias facturas
  OR (
    public.jwt_claim('role') = 'DUENO_MASCOTA'
    AND auth.uid() = owner_id
  )
);

-- INSERT ─────────────────────────────────────────────────────
-- Solo CLINIC_ADMIN puede crear facturas.
-- El microservicio lo hace con service_role (bypass RLS automático).
-- Esta política protege acceso directo a PostgREST.
CREATE POLICY "invoices_insert"
ON invoices FOR INSERT
WITH CHECK (
  public.jwt_claim('role') = 'CLINIC_ADMIN'
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- UPDATE ─────────────────────────────────────────────────────
CREATE POLICY "invoices_update"
ON invoices FOR UPDATE
USING (
  public.jwt_claim('role') = 'CLINIC_ADMIN'
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- ============================================================
-- TABLA 2: payments
-- Reglas de acceso:
--   SELECT : CLINIC_ADMIN/VETERINARIO de la clínica de la factura
--            DUENO_MASCOTA que sea dueño de la factura asociada
--   INSERT : ⛔ Bloqueado para clientes directos
--            (solo vía service_role desde el webhook de Wompi/Bold)
--   UPDATE : ⛔ Bloqueado para clientes directos
--            (solo vía service_role desde el webhook de Wompi/Bold)
-- ============================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select" ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_update" ON payments;

-- SELECT ─────────────────────────────────────────────────────
CREATE POLICY "payments_select"
ON payments FOR SELECT
USING (
  -- Personal de clínica: pagos de facturas de su clínica
  (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
        AND i.clinic_id = public.jwt_claim('clinic_id')::uuid
    )
  )
  -- Dueño de mascota: solo pagos de sus propias facturas
  OR (
    public.jwt_claim('role') = 'DUENO_MASCOTA'
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
        AND i.owner_id = auth.uid()
    )
  )
);

-- INSERT — Bloqueado para tokens JWT de usuario.
-- El webhook de Wompi/Bold llega al microservicio con service_role → bypass RLS.
-- Si un cliente autenticado intenta insertar directamente, se rechaza.
CREATE POLICY "payments_insert"
ON payments FOR INSERT
WITH CHECK (false);

-- UPDATE — Igual que INSERT, solo via service_role (webhook).
CREATE POLICY "payments_update"
ON payments FOR UPDATE
USING (false);

-- ============================================================
-- TABLA 3: clinic_pricing
-- Reglas de acceso:
--   SELECT : CLINIC_ADMIN / VETERINARIO de su propia clínica
--            DUENO_MASCOTA puede consultar precios (lectura pública de precios)
--   INSERT : Solo CLINIC_ADMIN de su clínica
--   UPDATE : Solo CLINIC_ADMIN de su clínica
-- ============================================================

ALTER TABLE clinic_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_pricing_select" ON clinic_pricing;
DROP POLICY IF EXISTS "clinic_pricing_insert" ON clinic_pricing;
DROP POLICY IF EXISTS "clinic_pricing_update" ON clinic_pricing;

-- SELECT ─────────────────────────────────────────────────────
CREATE POLICY "clinic_pricing_select"
ON clinic_pricing FOR SELECT
USING (
  -- Personal de clínica: solo su propia configuración de precios
  (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND public.jwt_claim('clinic_id')::uuid = clinic_id
  )
  -- Dueño de mascota: puede consultar precios de cualquier clínica (lectura)
  OR public.jwt_claim('role') = 'DUENO_MASCOTA'
);

-- INSERT ─────────────────────────────────────────────────────
CREATE POLICY "clinic_pricing_insert"
ON clinic_pricing FOR INSERT
WITH CHECK (
  public.jwt_claim('role') = 'CLINIC_ADMIN'
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- UPDATE ─────────────────────────────────────────────────────
CREATE POLICY "clinic_pricing_update"
ON clinic_pricing FOR UPDATE
USING (
  public.jwt_claim('role') = 'CLINIC_ADMIN'
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- ============================================================
-- VERIFICACIÓN (ejecutar después de aplicar las políticas)
-- ============================================================

-- Ver estado RLS de las tablas:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('invoices', 'payments', 'clinic_pricing');

-- Ver todas las políticas creadas:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('invoices', 'payments', 'clinic_pricing')
-- ORDER BY tablename, cmd;
