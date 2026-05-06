/**
 * tests/unit/billing.service.test.ts
 *
 * Pruebas unitarias para InvoiceService y PaymentService.
 * Las dependencias (repositorios y fetch) se mockean completamente
 * para evitar cualquier conexión real a Supabase o servicios externos.
 */

import { InvoiceService, PaymentService } from '../../src/services/billing.service';
import { Invoice, Payment } from '../../src/models/billing.model';

// ─── Mocks de repositorios ────────────────────────────────────────────────────

jest.mock('../../src/repositories/billing.repository', () => {
    const mockInvoiceRepo = {
        create:                   jest.fn(),
        findById:                 jest.fn(),
        findByOwner:              jest.fn(),
        findByClinic:             jest.fn(),
        findByTransactionId:      jest.fn(),
        findByBoldLink:           jest.fn(),
        findByReference:          jest.fn(),
        updateStatus:             jest.fn(),
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

// Mock global fetch (no llamadas reales al appointment-service)
global.fetch = jest.fn();

// ─── Acceso a los mocks ───────────────────────────────────────────────────────

import * as billingRepo from '../../src/repositories/billing.repository';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockInvoiceRepo = (billingRepo as any).__mockInvoiceRepo;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPaymentRepo = (billingRepo as any).__mockPaymentRepo;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseInvoice: Invoice = {
    id:           'inv-uuid-001',
    clinic_id:    'clinic-001',
    owner_id:     'owner-001',
    total_amount: 150000,
    status:       'DRAFT',
    reference:    'INV-AB12CD34',
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
};

const basePayment: Payment = {
    id:         'pay-uuid-001',
    invoice_id: 'inv-uuid-001',
    provider:   'BOLD',
    amount:     150000,
    currency:   'COP',
    reference:  'INV-AB12CD34',
    status:     'PENDING',
    created_at: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceService
// ─────────────────────────────────────────────────────────────────────────────

describe('InvoiceService', () => {
    let invoiceService: InvoiceService;

    beforeEach(() => {
        jest.clearAllMocks();
        invoiceService = new InvoiceService();
    });

    // ── createInvoice ──────────────────────────────────────────────────────────

    describe('createInvoice', () => {
        it('crea una factura exitosamente sin restricción de clínica', async () => {
            mockInvoiceRepo.create.mockResolvedValue(baseInvoice);

            const result = await invoiceService.createInvoice({
                clinic_id:    'clinic-001',
                owner_id:     'owner-001',
                total_amount: 150000,
            });

            // Matcher: toEqual — verifica estructura completa del objeto
            expect(result).toEqual(baseInvoice);
            // Matcher: toHaveProperty — verifica campos específicos
            expect(result).toHaveProperty('id', 'inv-uuid-001');
            expect(result).toHaveProperty('status', 'DRAFT');
            expect(mockInvoiceRepo.create).toHaveBeenCalledTimes(1);
        });

        it('lanza error 403 si la clínica del solicitante no coincide', async () => {
            await expect(
                invoiceService.createInvoice(
                    { clinic_id: 'clinic-A', owner_id: 'owner-001', total_amount: 5000 },
                    'clinic-B', // requesterClinicId diferente → 403
                )
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        it('lanza error 400 si total_amount es 0 o negativo', async () => {
            await expect(
                invoiceService.createInvoice({
                    clinic_id:    'clinic-001',
                    owner_id:     'owner-001',
                    total_amount: 0,
                })
            ).rejects.toMatchObject({ statusCode: 400 });
        });
    });

    // ── getInvoices ────────────────────────────────────────────────────────────

    describe('getInvoices', () => {
        it('retorna facturas del dueño cuando el rol es DUENO_MASCOTA', async () => {
            mockInvoiceRepo.findByOwner.mockResolvedValue([baseInvoice]);

            const result = await invoiceService.getInvoices('DUENO_MASCOTA', 'owner-001');

            // Matcher: toBeDefined — verifica que existe
            expect(result).toBeDefined();
            // Matcher: toBe — comparación primitiva
            expect(result.length).toBe(1);
            expect(mockInvoiceRepo.findByOwner).toHaveBeenCalledWith('owner-001');
        });

        it('retorna facturas de la clínica para roles de clínica', async () => {
            mockInvoiceRepo.findByClinic.mockResolvedValue([baseInvoice]);

            const result = await invoiceService.getInvoices('CLINIC_ADMIN', 'admin-001', 'clinic-001');

            expect(result).toBeDefined();
            expect(result.length).toBe(1);
            expect(mockInvoiceRepo.findByClinic).toHaveBeenCalledWith('clinic-001');
        });

        it('lanza error 403 para rol sin permisos', async () => {
            await expect(
                invoiceService.getInvoices('UNKNOWN_ROLE', 'user-001')
            ).rejects.toMatchObject({ statusCode: 403 });
        });
    });

    // ── getInvoiceById ─────────────────────────────────────────────────────────

    describe('getInvoiceById', () => {
        it('retorna la factura cuando el dueño tiene acceso', async () => {
            mockInvoiceRepo.findById.mockResolvedValue(baseInvoice);

            const result = await invoiceService.getInvoiceById(
                'inv-uuid-001', 'DUENO_MASCOTA', 'owner-001'
            );

            expect(result).toHaveProperty('id', 'inv-uuid-001');
            expect(result).toHaveProperty('owner_id', 'owner-001');
        });

        it('lanza error 404 cuando la factura no existe', async () => {
            mockInvoiceRepo.findById.mockResolvedValue(null);

            await expect(
                invoiceService.getInvoiceById('nonexistent', 'CLINIC_ADMIN', 'admin-001', 'clinic-001')
            ).rejects.toMatchObject({ statusCode: 404 });
        });

        it('lanza error 403 cuando un DUENO_MASCOTA accede a factura ajena', async () => {
            mockInvoiceRepo.findById.mockResolvedValue({ ...baseInvoice, owner_id: 'otro-owner' });

            await expect(
                invoiceService.getInvoiceById('inv-uuid-001', 'DUENO_MASCOTA', 'owner-001')
            ).rejects.toMatchObject({ statusCode: 403 });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PaymentService
// ─────────────────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
    let paymentService: PaymentService;

    beforeEach(() => {
        jest.clearAllMocks();
        paymentService = new PaymentService();
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    });

    // ── initiatePayment ────────────────────────────────────────────────────────

    describe('initiatePayment', () => {
        it('genera URL de pago y crea registro de pago cuando no existe uno previo', async () => {
            mockInvoiceRepo.findById.mockResolvedValue(baseInvoice);
            mockPaymentRepo.findByReference.mockResolvedValue(null);  // sin pago previo
            mockPaymentRepo.create.mockResolvedValue(basePayment);
            mockInvoiceRepo.updateStatus.mockResolvedValue({ ...baseInvoice, status: 'PENDING_PAYMENT' });

            // Prueba async con resolves
            await expect(
                paymentService.initiatePayment('inv-uuid-001', 'owner-001', 'DUENO_MASCOTA')
            ).resolves.toHaveProperty('redirect_url');

            const result = await paymentService.initiatePayment('inv-uuid-001', 'owner-001', 'DUENO_MASCOTA');
            expect(result).toHaveProperty('reference', 'INV-AB12CD34');
            expect(result.redirect_url).toContain('reference=');
        });

        it('reutiliza el registro de pago existente (idempotente)', async () => {
            mockInvoiceRepo.findById.mockResolvedValue(baseInvoice);
            mockPaymentRepo.findByReference.mockResolvedValue(basePayment); // pago ya existe
            mockInvoiceRepo.updateStatus.mockResolvedValue({ ...baseInvoice, status: 'PENDING_PAYMENT' });

            await paymentService.initiatePayment('inv-uuid-001', 'owner-001', 'DUENO_MASCOTA');

            // No debe crear un nuevo pago
            expect(mockPaymentRepo.create).not.toHaveBeenCalled();
        });

        it('lanza error 404 si la factura no existe', async () => {
            mockInvoiceRepo.findById.mockResolvedValue(null);

            await expect(
                paymentService.initiatePayment('nonexistent', 'owner-001', 'DUENO_MASCOTA')
            ).rejects.toMatchObject({ statusCode: 404 });
        });

        it('lanza error 400 si la factura ya está PAID', async () => {
            mockInvoiceRepo.findById.mockResolvedValue({ ...baseInvoice, status: 'PAID' });

            // Prueba async con rejects
            await expect(
                paymentService.initiatePayment('inv-uuid-001', 'owner-001', 'DUENO_MASCOTA')
            ).rejects.toMatchObject({ statusCode: 400 });
        });

        it('lanza error 400 si la factura está CANCELLED', async () => {
            mockInvoiceRepo.findById.mockResolvedValue({ ...baseInvoice, status: 'CANCELLED' });

            await expect(
                paymentService.initiatePayment('inv-uuid-001', 'owner-001', 'DUENO_MASCOTA')
            ).rejects.toMatchObject({ statusCode: 400 });
        });
    });

    // ── confirmPayment ─────────────────────────────────────────────────────────

    describe('confirmPayment', () => {
        it('confirma el pago exitosamente y actualiza la factura a PAID', async () => {
            mockInvoiceRepo.findById.mockResolvedValue(baseInvoice);
            mockPaymentRepo.findByReference.mockResolvedValue(basePayment);
            mockPaymentRepo.updateFromWebhook.mockResolvedValue({ ...basePayment, status: 'SUCCESS' });
            mockInvoiceRepo.updateStatus.mockResolvedValue({ ...baseInvoice, status: 'PAID' });
            // Segunda llamada de findById dentro de notifyAppointmentPaid (sin appointment_id)
            mockInvoiceRepo.findById.mockResolvedValueOnce(baseInvoice).mockResolvedValueOnce({ ...baseInvoice, appointment_id: undefined });

            await expect(
                paymentService.confirmPayment('inv-uuid-001', 'INV-AB12CD34')
            ).resolves.toBeUndefined();

            expect(mockInvoiceRepo.updateStatus).toHaveBeenCalledWith('inv-uuid-001', 'PAID');
        });

        it('es idempotente si la factura ya está PAID', async () => {
            mockInvoiceRepo.findById.mockResolvedValue({ ...baseInvoice, status: 'PAID' });

            await paymentService.confirmPayment('inv-uuid-001', 'INV-AB12CD34');

            // No debe actualizar nada
            expect(mockInvoiceRepo.updateStatus).not.toHaveBeenCalled();
        });

        it('lanza error 400 si la referencia no coincide', async () => {
            mockInvoiceRepo.findById.mockResolvedValue({ ...baseInvoice, reference: 'INV-CORRECTA' });

            await expect(
                paymentService.confirmPayment('inv-uuid-001', 'INV-INCORRECTA')
            ).rejects.toMatchObject({ statusCode: 400 });
        });

        it('lanza error 404 si la factura no existe', async () => {
            mockInvoiceRepo.findById.mockResolvedValue(null);

            await expect(
                paymentService.confirmPayment('nonexistent', 'INV-AB12CD34')
            ).rejects.toMatchObject({ statusCode: 404 });
        });
    });
});
