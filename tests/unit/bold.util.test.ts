/**
 * tests/unit/bold.util.test.ts
 *
 * Pruebas unitarias para validateBoldSignature().
 * Cubre: DISABLE_WEBHOOK_SIGNATURE, firma válida, firma vacía (pruebas Bold),
 * firma inválida y manejo de errores internos.
 *
 * NOTA: env.ts evalúa DISABLE_WEBHOOK_SIGNATURE al importarse, por lo que
 * usamos jest.mock('../../src/config/env') para controlar el valor
 * sin depender de process.env en tiempo de ejecución.
 */

import crypto from 'crypto';

// ─── Mock del módulo env ──────────────────────────────────────────────────────
// Lo hacemos mutable para poder cambiar DISABLE_WEBHOOK_SIGNATURE por test
const mockEnv = {
    DISABLE_WEBHOOK_SIGNATURE: false,
    BOLD_API_SECRET: 'bold_test_secret',
};

jest.mock('../../src/config/env', () => ({ env: mockEnv }));

import { validateBoldSignature } from '../../src/utils/bold.util';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: genera firma HMAC-SHA256 exactamente igual que Bold
// ─────────────────────────────────────────────────────────────────────────────
function boldSign(rawBody: string, secret: string): string {
    const base64Body = Buffer.from(rawBody, 'utf8').toString('base64');
    return crypto.createHmac('sha256', secret).update(base64Body).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────

describe('validateBoldSignature', () => {
    const testBody   = JSON.stringify({ type: 'SALE_APPROVED', data: {} });
    const testSecret = 'mi_secreto_bold';

    afterEach(() => {
        // Restaurar a false tras cada test
        mockEnv.DISABLE_WEBHOOK_SIGNATURE = false;
    });

    // ── DISABLE activo ────────────────────────────────────────────────────────

    it('retorna true cuando DISABLE_WEBHOOK_SIGNATURE=true (sin validar HMAC)', () => {
        mockEnv.DISABLE_WEBHOOK_SIGNATURE = true;

        // Firma incorrecta — pero está deshabilitada la validación
        const result = validateBoldSignature(Buffer.from(testBody), 'firma-cualquiera', testSecret);

        // Matcher: toBe — comparación booleana exacta
        expect(result).toBe(true);
    });

    // ── Firma válida con secret real ──────────────────────────────────────────

    it('retorna true con firma HMAC válida usando el secret configurado', () => {
        const validSig = boldSign(testBody, testSecret);

        const result = validateBoldSignature(Buffer.from(testBody), validSig, testSecret);

        // Matcher: toBe
        expect(result).toBe(true);
    });

    it('retorna true cuando el body se pasa como string (no Buffer)', () => {
        const validSig = boldSign(testBody, testSecret);

        // Rama Buffer.isBuffer(rawBody) === false
        const result = validateBoldSignature(testBody, validSig, testSecret);

        expect(result).toBe(true);
    });

    // ── Firma con cadena vacía (entorno de pruebas Bold) ──────────────────────

    it('retorna true con firma generada con cadena vacía (entorno de pruebas Bold)', () => {
        const sigWithEmpty = boldSign(testBody, '');

        // Secret "incorrecto" → falla primer check → fallback con '' → válido
        const result = validateBoldSignature(Buffer.from(testBody), sigWithEmpty, 'secret_incorrecto');

        // Matcher: toBe
        expect(result).toBe(true);
    });

    // ── Firma inválida ────────────────────────────────────────────────────────

    it('retorna false cuando la firma no coincide con ningún secret', () => {
        const wrongSig = boldSign(testBody, 'secret_equivocado');

        const result = validateBoldSignature(Buffer.from(testBody), wrongSig, testSecret);

        // Matcher: toBe
        expect(result).toBe(false);
    });

    it('retorna false cuando la firma hex tiene longitud distinta (sin lanzar)', () => {
        // Una firma demasiado corta → length mismatch → return false
        const result = validateBoldSignature(Buffer.from(testBody), 'aabb', testSecret);

        expect(result).toBe(false);
    });

    // ── Manejo de error interno ────────────────────────────────────────────────

    it('retorna false (no lanza) si la firma contiene caracteres no-hex', () => {
        // Buffer.from('no-es-hex!') con encoding 'hex' produce buffer vacío → timingSafeEqual
        // lanza RangeError (length mismatch) → catch → return false
        const result = validateBoldSignature(Buffer.from(testBody), 'no-es-hex!@#$%^', testSecret);

        // Matcher: toBeDefined
        expect(result).toBeDefined();
        // Matcher: toBe
        expect(result).toBe(false);
    });
});
