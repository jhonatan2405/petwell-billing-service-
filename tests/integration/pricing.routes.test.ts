/**
 * tests/integration/pricing.routes.test.ts
 *
 * Pruebas de integración para los endpoints de precios:
 *   GET  /api/v1/billing/pricing/:clinicId
 *   POST /api/v1/billing/pricing
 *
 * Usa supertest importando `app` directamente (sin app.listen()).
 * PricingRepository se mockea para evitar conexiones reales a Supabase.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { ClinicPricing } from '../../src/models/pricing.model';

// ─── Mock del repositorio de precios ─────────────────────────────────────────

jest.mock('../../src/repositories/pricing.repository', () => {
    const mockRepo = {
        findByClinic: jest.fn(),
        upsert:       jest.fn(),
    };
    return {
        PricingRepository: jest.fn(() => mockRepo),
        __mockRepo: mockRepo,
    };
});

// También mockear billing.repository para que no falle la importación de server
jest.mock('../../src/repositories/billing.repository', () => {
    const mockInvoiceRepo = {
        create: jest.fn(), findById: jest.fn(), findByOwner: jest.fn(),
        findByClinic: jest.fn(), findByReference: jest.fn(),
        findByTransactionId: jest.fn(), findByBoldLink: jest.fn(),
        updateStatus: jest.fn(), updateStatusAndTransaction: jest.fn(),
    };
    const mockPaymentRepo = {
        create: jest.fn(), findByReference: jest.fn(), updateFromWebhook: jest.fn(),
    };
    return {
        InvoiceRepository: jest.fn(() => mockInvoiceRepo),
        PaymentRepository: jest.fn(() => mockPaymentRepo),
        __mockInvoiceRepo: mockInvoiceRepo,
        __mockPaymentRepo: mockPaymentRepo,
    };
});

import * as pricingRepo from '../../src/repositories/pricing.repository';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRepo = (pricingRepo as any).__mockRepo;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env['JWT_SECRET'] as string;

function makeToken(overrides: object = {}) {
    return jwt.sign(
        { sub: 'user-001', email: 'test@petwell.co', role: 'CLINIC_ADMIN', ...overrides },
        JWT_SECRET,
        { expiresIn: '1h' },
    );
}

const clinicAdminToken  = makeToken({ role: 'CLINIC_ADMIN',   clinic_id: 'clinic-001' });
const petwellAdminToken = makeToken({ role: 'PETWELL_ADMIN',  clinic_id: undefined });
const vetToken          = makeToken({ role: 'VETERINARIO',    clinic_id: 'clinic-001' });

// ─── Fixture ──────────────────────────────────────────────────────────────────

const basePricing: ClinicPricing = {
    id:                 'pricing-uuid-001',
    clinic_id:          'clinic-001',
    price_consulta:     80000,
    price_telemedicina: 50000,
    price_urgencia:     120000,
    price_vacunacion:   40000,
    updated_at:         new Date().toISOString(),
};

const validDto = {
    clinic_id:          'clinic-001',
    price_consulta:     90000,
    price_telemedicina: 55000,
    price_urgencia:     130000,
    price_vacunacion:   45000,
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/billing/pricing/:clinicId
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/billing/pricing/:clinicId', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna precios existentes para la clínica', async () => {
        mockRepo.findByClinic.mockResolvedValue(basePricing);

        const res = await request(app)
            .get('/api/v1/billing/pricing/clinic-001')
            .set('Authorization', `Bearer ${clinicAdminToken}`);

        expect(res.status).toBe(200);
        // Matcher: toHaveProperty
        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('clinic_id', 'clinic-001');
        expect(res.body.data).toHaveProperty('price_consulta', 80000);
    });

    it('retorna precios por defecto (todos 0) si la clínica no tiene configuración', async () => {
        mockRepo.findByClinic.mockResolvedValue(null);

        const res = await request(app)
            .get('/api/v1/billing/pricing/clinic-nueva')
            .set('Authorization', `Bearer ${clinicAdminToken}`);

        expect(res.status).toBe(200);
        // Matcher: toBeDefined
        expect(res.body.data).toBeDefined();
        // Matcher: toBe — precios por defecto son 0
        expect(res.body.data.price_consulta).toBe(0);
        expect(res.body.data.price_telemedicina).toBe(0);
    });

    it('retorna 401 si no hay token JWT', async () => {
        const res = await request(app).get('/api/v1/billing/pricing/clinic-001');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('success', false);
    });

    it('retorna precios para VETERINARIO autenticado', async () => {
        mockRepo.findByClinic.mockResolvedValue(basePricing);

        const res = await request(app)
            .get('/api/v1/billing/pricing/clinic-001')
            .set('Authorization', `Bearer ${vetToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('price_urgencia', 120000);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/billing/pricing
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/billing/pricing', () => {
    beforeEach(() => jest.clearAllMocks());

    it('guarda precios exitosamente como PETWELL_ADMIN', async () => {
        mockRepo.upsert.mockResolvedValue({ ...basePricing, ...validDto });

        const res = await request(app)
            .post('/api/v1/billing/pricing')
            .set('Authorization', `Bearer ${petwellAdminToken}`)
            .send(validDto);

        expect(res.status).toBe(200);
        // Matcher: toEqual — verifica estructura completa de la respuesta
        expect(res.body).toHaveProperty('success', true);
        expect(res.body.data).toHaveProperty('price_consulta', 90000);
    });

    it('guarda precios exitosamente como CLINIC_ADMIN para su propia clínica', async () => {
        mockRepo.upsert.mockResolvedValue(basePricing);

        const res = await request(app)
            .post('/api/v1/billing/pricing')
            .set('Authorization', `Bearer ${clinicAdminToken}`)
            .send(validDto);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
    });

    it('retorna 403 si VETERINARIO intenta configurar precios', async () => {
        const res = await request(app)
            .post('/api/v1/billing/pricing')
            .set('Authorization', `Bearer ${vetToken}`)
            .send(validDto);

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('success', false);
    });

    it('retorna 400 si un precio es negativo', async () => {
        const res = await request(app)
            .post('/api/v1/billing/pricing')
            .set('Authorization', `Bearer ${petwellAdminToken}`)
            .send({ ...validDto, price_consulta: -500 });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('success', false);
    });

    it('retorna 401 sin autenticación', async () => {
        const res = await request(app)
            .post('/api/v1/billing/pricing')
            .send(validDto);

        expect(res.status).toBe(401);
    });
});
