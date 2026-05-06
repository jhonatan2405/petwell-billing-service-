/**
 * tests/integration/billing.routes.test.ts
 *
 * Pruebas de integración para los endpoints de billing:
 *   POST   /api/v1/billing/invoices         (autenticación interna)
 *   GET    /api/v1/billing/invoices          (JWT)
 *   GET    /api/v1/billing/invoices/:id      (JWT)
 *   POST   /api/v1/billing/payments/init     (JWT)
 *   POST   /api/v1/billing/payments/confirm  (JWT)
 *
 * Se importa `app` directamente — NO se llama a app.listen().
 * Los repositorios de Supabase se mockean para evitar conexiones reales.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';

// ─── Mock completo de los repositorios ───────────────────────────────────────

jest.mock('../../src/repositories/billing.repository', () => {
    const mockInvoiceRepo = {
        create:                     jest.fn(),
        findById:                   jest.fn(),
        findByOwner:                jest.fn(),
        findByClinic:               jest.fn(),
        findByReference:            jest.fn(),
        findByTransactionId:        jest.fn(),
        findByBoldLink:             jest.fn(),
        updateStatus:               jest.fn(),
        updateStatusAndTransaction: jest.fn(),
    };
    const mockPaymentRepo = {
        create:            jest.fn(),
        findByReference:   jest.fn(),
        updateFromWebhook: jest.fn(),
    };
    return {
        InvoiceRepository: jest.fn(() => mockInvoiceRepo),
        PaymentRepository: jest.fn(() => mockPaymentRepo),
        __mockInvoiceRepo: mockInvoiceRepo,
        __mockPaymentRepo: mockPaymentRepo,
    };
});

jest.mock('../../src/repositories/pricing.repository', () => {
    const mockRepo = { findByClinic: jest.fn(), upsert: jest.fn() };
    return { PricingRepository: jest.fn(() => mockRepo), __mockRepo: mockRepo };
});

// Mock global fetch (fire-and-forget calls al appointment-service)
global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });

import * as billingRepo from '../../src/repositories/billing.repository';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockInvoiceRepo = (billingRepo as any).__mockInvoiceRepo;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPaymentRepo = (billingRepo as any).__mockPaymentRepo;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env['JWT_SECRET'] as string;
const INTERNAL_KEY = process.env['INTERNAL_SERVICE_KEY'] as string;

function makeToken(overrides: object = {}) {
    return jwt.sign(
        { sub: 'user-001', email: 'test@petwell.co', role: 'DUENO_MASCOTA', ...overrides },
        JWT_SECRET,
        { expiresIn: '1h' },
    );
}

const ownerToken     = makeToken({ role: 'DUENO_MASCOTA', sub: 'owner-001' });
const adminToken     = makeToken({ role: 'CLINIC_ADMIN',  sub: 'admin-001', clinic_id: 'clinic-001' });

// ─── Fixture ──────────────────────────────────────────────────────────────────

const baseInvoice = {
    id:           'inv-uuid-001',
    clinic_id:    'clinic-001',
    owner_id:     'owner-001',
    total_amount: 150000,
    status:       'DRAFT',
    reference:    'INV-AB12CD34',
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('responde 200 con status ok', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        // Matcher: toHaveProperty — verifica campo específico
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('service', 'billing-service');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/billing/invoices  (autenticación por service key)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/billing/invoices', () => {
    beforeEach(() => jest.clearAllMocks());

    it('crea una factura exitosamente con service key válida', async () => {
        mockInvoiceRepo.create.mockResolvedValue(baseInvoice);

        const res = await request(app)
            .post('/api/v1/billing/invoices')
            .set('x-internal-service-key', INTERNAL_KEY)
            .send({
                clinic_id:    'clinic-001',
                owner_id:     'owner-001',
                total_amount: 150000,
            });

        expect(res.status).toBe(201);
        // Matcher: toEqual — compara objeto completo
        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toEqual(baseInvoice);
    });

    it('rechaza con 403 si falta la service key', async () => {
        const res = await request(app)
            .post('/api/v1/billing/invoices')
            .send({ clinic_id: 'clinic-001', owner_id: 'owner-001', total_amount: 5000 });

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('success', false);
    });

    it('retorna 500 cuando el servicio lanza error inesperado', async () => {
        mockInvoiceRepo.create.mockRejectedValue(new Error('DB error'));

        const res = await request(app)
            .post('/api/v1/billing/invoices')
            .set('x-internal-service-key', INTERNAL_KEY)
            .send({ clinic_id: 'clinic-001', owner_id: 'owner-001', total_amount: 100 });

        expect(res.status).toBe(500);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/billing/invoices
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/billing/invoices', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lista facturas del dueño autenticado', async () => {
        mockInvoiceRepo.findByOwner.mockResolvedValue([baseInvoice]);

        const res = await request(app)
            .get('/api/v1/billing/invoices')
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        // Matcher: toBeDefined
        expect(res.body.data).toBeDefined();
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('retorna 401 sin token JWT', async () => {
        const res = await request(app).get('/api/v1/billing/invoices');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('success', false);
    });

    it('lista facturas de la clínica para CLINIC_ADMIN', async () => {
        mockInvoiceRepo.findByClinic.mockResolvedValue([baseInvoice]);

        const res = await request(app)
            .get('/api/v1/billing/invoices')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/billing/invoices/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/billing/invoices/:id', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna la factura correcta para el dueño', async () => {
        mockInvoiceRepo.findById.mockResolvedValue(baseInvoice);

        const res = await request(app)
            .get('/api/v1/billing/invoices/inv-uuid-001')
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('id', 'inv-uuid-001');
    });

    it('retorna 404 si la factura no existe', async () => {
        mockInvoiceRepo.findById.mockResolvedValue(null);

        const res = await request(app)
            .get('/api/v1/billing/invoices/nonexistent-id')
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('success', false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/billing/payments/init
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/billing/payments/init', () => {
    beforeEach(() => jest.clearAllMocks());

    it('genera URL de pago exitosamente', async () => {
        mockInvoiceRepo.findById.mockResolvedValue(baseInvoice);
        mockPaymentRepo.findByReference.mockResolvedValue(null);
        mockPaymentRepo.create.mockResolvedValue({ id: 'pay-001' });
        mockInvoiceRepo.updateStatus.mockResolvedValue({ ...baseInvoice, status: 'PENDING_PAYMENT' });

        const res = await request(app)
            .post('/api/v1/billing/payments/init')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ invoice_id: 'inv-uuid-001' });

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('redirect_url');
        expect(res.body.data).toHaveProperty('reference');
    });

    it('retorna 400 si falta invoice_id en el body', async () => {
        const res = await request(app)
            .post('/api/v1/billing/payments/init')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('success', false);
    });

    it('retorna 401 sin autenticación', async () => {
        const res = await request(app)
            .post('/api/v1/billing/payments/init')
            .send({ invoice_id: 'inv-uuid-001' });

        expect(res.status).toBe(401);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/billing/payments/confirm
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/billing/payments/confirm', () => {
    beforeEach(() => jest.clearAllMocks());

    it('confirma el pago exitosamente', async () => {
        mockInvoiceRepo.findById
            .mockResolvedValueOnce(baseInvoice)                                  // confirmPayment
            .mockResolvedValueOnce({ ...baseInvoice, appointment_id: undefined }); // notifyAppointmentPaid
        mockPaymentRepo.findByReference.mockResolvedValue({ id: 'pay-001', reference: 'INV-AB12CD34' });
        mockPaymentRepo.updateFromWebhook.mockResolvedValue({ id: 'pay-001', status: 'SUCCESS' });
        mockInvoiceRepo.updateStatus.mockResolvedValue({ ...baseInvoice, status: 'PAID' });

        const res = await request(app)
            .post('/api/v1/billing/payments/confirm')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ invoice_id: 'inv-uuid-001', reference: 'INV-AB12CD34' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
    });

    it('retorna 400 si faltan invoice_id o reference', async () => {
        const res = await request(app)
            .post('/api/v1/billing/payments/confirm')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ invoice_id: 'inv-uuid-001' }); // falta reference

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('success', false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 route
// ─────────────────────────────────────────────────────────────────────────────

describe('Ruta no encontrada', () => {
    it('retorna 404 para rutas inexistentes', async () => {
        const res = await request(app).get('/api/v1/ruta-inexistente');

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('success', false);
    });
});
