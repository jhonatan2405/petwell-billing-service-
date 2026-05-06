/**
 * tests/integration/webhook.routes.test.ts
 *
 * Pruebas de integración para el endpoint webhook de Bold:
 *   POST /api/v1/billing/payments/webhook
 *
 * DISABLE_WEBHOOK_SIGNATURE=true en tests/setup.ts → no se valida HMAC.
 * WebhookService se mockea para aislar la lógica de la ruta.
 */

import request from 'supertest';
import app from '../../src/server';

// ─── Mock de WebhookService ───────────────────────────────────────────────────

jest.mock('../../src/services/webhook.service', () => {
    const mockService = {
        processEvent: jest.fn(),
    };
    return {
        WebhookService: jest.fn(() => mockService),
        __mockService: mockService,
    };
});

// Mock repositorios para que server.ts importe sin error
jest.mock('../../src/repositories/billing.repository', () => {
    const m = {
        create: jest.fn(), findById: jest.fn(), findByOwner: jest.fn(),
        findByClinic: jest.fn(), findByReference: jest.fn(),
        findByTransactionId: jest.fn(), findByBoldLink: jest.fn(),
        updateStatus: jest.fn(), updateStatusAndTransaction: jest.fn(),
    };
    const p = { create: jest.fn(), findByReference: jest.fn(), updateFromWebhook: jest.fn() };
    return {
        InvoiceRepository: jest.fn(() => m),
        PaymentRepository: jest.fn(() => p),
    };
});

jest.mock('../../src/repositories/pricing.repository', () => ({
    PricingRepository: jest.fn(() => ({ findByClinic: jest.fn(), upsert: jest.fn() })),
}));

import * as webhookServiceModule from '../../src/services/webhook.service';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockService = (webhookServiceModule as any).__mockService;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/billing/payments/webhook', () => {
    const WEBHOOK_URL = '/api/v1/billing/payments/webhook';

    beforeEach(() => jest.clearAllMocks());

    const saleApprovedPayload = {
        type:      'SALE_APPROVED',
        data:      { payment_id: 'bold-tx-001', metadata: { reference: 'INV-AB12CD34' } },
        timestamp: new Date().toISOString(),
    };

    it('responde 200 inmediatamente con { received: true } (SALE_APPROVED)', async () => {
        mockService.processEvent.mockResolvedValue({ processed: true, message: 'OK' });

        const res = await request(app)
            .post(WEBHOOK_URL)
            .set('Content-Type', 'application/json')
            .send(saleApprovedPayload);

        // Bold exige siempre HTTP 200
        expect(res.status).toBe(200);
        // Matcher: toHaveProperty
        expect(res.body).toHaveProperty('received', true);
    });

    it('responde 200 para evento SALE_REJECTED (procesamiento en background)', async () => {
        mockService.processEvent.mockResolvedValue({ processed: false, message: 'ignorado' });

        const res = await request(app)
            .post(WEBHOOK_URL)
            .set('Content-Type', 'application/json')
            .send({ type: 'SALE_REJECTED', data: {}, timestamp: new Date().toISOString() });

        expect(res.status).toBe(200);
        // Matcher: toBe
        expect(res.body.received).toBe(true);
    });

    it('responde 200 con payload mínimo válido (sin firma, DISABLE=true)', async () => {
        mockService.processEvent.mockResolvedValue({ processed: false, message: 'Factura no encontrada' });

        const res = await request(app)
            .post(WEBHOOK_URL)
            .set('Content-Type', 'application/json')
            .send({ type: 'SALE_APPROVED', data: {} });

        expect(res.status).toBe(200);
        // Matcher: toBeDefined — verifica que el body existe
        expect(res.body).toBeDefined();
        expect(res.body).toHaveProperty('received', true);
    });

    it('responde 200 para evento con campos adicionales desconocidos', async () => {
        mockService.processEvent.mockResolvedValue({ processed: false, message: 'ignorado' });

        const res = await request(app)
            .post(WEBHOOK_URL)
            .set('Content-Type', 'application/json')
            .send({
                type:      'PAYMENT_REVERSED',
                data:      { payment_id: 'bold-rev-999', amount: 99000 },
                timestamp: new Date().toISOString(),
                extra:     'campo_ignorado',
            });

        // Bold siempre recibe 200, incluso para eventos desconocidos
        expect(res.status).toBe(200);
        // Matcher: toBe
        expect(res.body.received).toBe(true);
    });

    it('no bloquea el request aunque processEvent falle (fire-and-forget)', async () => {
        // processEvent lanza error asíncrono, pero el webhook ya respondió 200
        mockService.processEvent.mockRejectedValue(new Error('async fail'));

        const res = await request(app)
            .post(WEBHOOK_URL)
            .set('Content-Type', 'application/json')
            .send(saleApprovedPayload);

        // El request debe completarse exitosamente sin importar el error del background
        expect(res.status).toBe(200);
        expect(res.body.received).toBe(true);
    });
});
