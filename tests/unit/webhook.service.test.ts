/**
 * tests/unit/webhook.service.test.ts
 *
 * Pruebas unitarias para WebhookService.processEvent().
 * Cubre todos los branches: SALE_APPROVED, otros eventos, factura no encontrada,
 * idempotencia, payment existente vs. nuevo, y manejo de errores internos.
 */

import { WebhookService } from '../../src/services/webhook.service';

// ─── Mocks de repositorios ────────────────────────────────────────────────────

jest.mock('../../src/repositories/billing.repository', () => {
    const mockInvoiceRepo = {
        findByTransactionId:        jest.fn(),
        findByBoldLink:             jest.fn(),
        updateStatusAndTransaction: jest.fn(),
    };
    const mockPaymentRepo = {
        findByReference:   jest.fn(),
        create:            jest.fn(),
        updateFromWebhook: jest.fn(),
    };
    return {
        InvoiceRepository: jest.fn(() => mockInvoiceRepo),
        PaymentRepository: jest.fn(() => mockPaymentRepo),
        __mockInvoiceRepo: mockInvoiceRepo,
        __mockPaymentRepo: mockPaymentRepo,
    };
});

// Mock global.fetch (fire-and-forget confirmAppointment)
global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });

import * as billingRepo from '../../src/repositories/billing.repository';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockInvoiceRepo = (billingRepo as any).__mockInvoiceRepo;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPaymentRepo = (billingRepo as any).__mockPaymentRepo;

// ─── Fixture ──────────────────────────────────────────────────────────────────

const baseInvoice = {
    id:             'inv-uuid-001',
    clinic_id:      'clinic-001',
    owner_id:       'owner-001',
    total_amount:   150000,
    status:         'DRAFT',
    reference:      'INV-AB12CD34',
    appointment_id: 'appt-001',
    created_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),
};

const saleApprovedEvent = {
    type:      'SALE_APPROVED',
    data:      { payment_id: 'bold-tx-123', metadata: { reference: 'INV-AB12CD34' } },
    timestamp: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('WebhookService.processEvent', () => {
    let webhookService: WebhookService;

    beforeEach(() => {
        jest.clearAllMocks();
        webhookService = new WebhookService();
    });

    // ── Evento ignorado ────────────────────────────────────────────────────────

    it('ignora eventos que no son SALE_APPROVED', async () => {
        const result = await webhookService.processEvent({
            type: 'SALE_REJECTED',
            data: {},
        } as any);

        // Matcher: toBe — comparación booleana exacta
        expect(result.processed).toBe(false);
        expect(result.message).toContain('ignorado');
    });

    // ── Factura no encontrada ──────────────────────────────────────────────────

    it('retorna processed=false si no se encuentra la factura por ningún medio', async () => {
        mockInvoiceRepo.findByTransactionId.mockResolvedValue(null);
        mockInvoiceRepo.findByBoldLink.mockResolvedValue(null);

        const result = await webhookService.processEvent(saleApprovedEvent as any);

        expect(result.processed).toBe(false);
        // Matcher: toHaveProperty
        expect(result).toHaveProperty('message', 'Factura no encontrada');
    });

    // ── Idempotencia ──────────────────────────────────────────────────────────

    it('retorna processed=true sin re-procesar si la factura ya está PAID', async () => {
        mockInvoiceRepo.findByTransactionId.mockResolvedValue({ ...baseInvoice, status: 'PAID' });

        const result = await webhookService.processEvent(saleApprovedEvent as any);

        expect(result.processed).toBe(true);
        expect(result.message).toContain('idempotente');
        // No debe actualizar la BD
        expect(mockInvoiceRepo.updateStatusAndTransaction).not.toHaveBeenCalled();
    });

    // ── Procesamiento exitoso con payment existente ────────────────────────────

    it('procesa SALE_APPROVED y actualiza payment existente a SUCCESS', async () => {
        mockInvoiceRepo.findByTransactionId.mockResolvedValue(baseInvoice);
        mockInvoiceRepo.updateStatusAndTransaction.mockResolvedValue({ ...baseInvoice, status: 'PAID' });
        mockPaymentRepo.findByReference.mockResolvedValue({ id: 'pay-001', reference: 'INV-AB12CD34', status: 'PENDING' });
        mockPaymentRepo.updateFromWebhook.mockResolvedValue({ id: 'pay-001', status: 'SUCCESS' });

        const result = await webhookService.processEvent(saleApprovedEvent as any);

        // Matcher: toBeDefined
        expect(result).toBeDefined();
        expect(result.processed).toBe(true);
        expect(mockInvoiceRepo.updateStatusAndTransaction).toHaveBeenCalledWith(
            'inv-uuid-001', 'PAID', 'bold-tx-123'
        );
        expect(mockPaymentRepo.updateFromWebhook).toHaveBeenCalled();
        expect(mockPaymentRepo.create).not.toHaveBeenCalled();
    });

    // ── Procesamiento con nuevo registro de pago ──────────────────────────────

    it('crea nuevo registro de pago cuando no existe uno previo', async () => {
        mockInvoiceRepo.findByTransactionId.mockResolvedValue(baseInvoice);
        mockInvoiceRepo.updateStatusAndTransaction.mockResolvedValue({ ...baseInvoice, status: 'PAID' });
        mockPaymentRepo.findByReference.mockResolvedValue(null); // sin pago previo
        mockPaymentRepo.create.mockResolvedValue({ id: 'pay-new-001' });
        mockPaymentRepo.updateFromWebhook.mockResolvedValue({ id: 'pay-new-001', status: 'SUCCESS' });

        const result = await webhookService.processEvent(saleApprovedEvent as any);

        expect(result.processed).toBe(true);
        expect(mockPaymentRepo.create).toHaveBeenCalledTimes(1);
        expect(mockPaymentRepo.updateFromWebhook).toHaveBeenCalled();
    });

    // ── Manejo de error interno ────────────────────────────────────────────────

    it('captura errores internos y retorna processed=false SIN lanzar excepción', async () => {
        mockInvoiceRepo.findByTransactionId.mockRejectedValue(new Error('DB connection failed'));
        mockInvoiceRepo.findByBoldLink.mockRejectedValue(new Error('DB connection failed'));

        // El webhook service NUNCA debe lanzar — siempre retorna
        await expect(
            webhookService.processEvent(saleApprovedEvent as any)
        ).resolves.toMatchObject({ processed: false });
    });

    // ── Fallback por bold_link ─────────────────────────────────────────────────

    it('busca por bold_link cuando no hay payment_id', async () => {
        const eventSinPaymentId = {
            type: 'SALE_APPROVED',
            data: { metadata: { reference: 'LNK_TEST123' } },
        };
        mockInvoiceRepo.findByTransactionId.mockResolvedValue(null);
        mockInvoiceRepo.findByBoldLink.mockResolvedValue(baseInvoice);
        mockInvoiceRepo.updateStatusAndTransaction.mockResolvedValue({ ...baseInvoice, status: 'PAID' });
        mockPaymentRepo.findByReference.mockResolvedValue(null);
        mockPaymentRepo.create.mockResolvedValue({ id: 'pay-001' });
        mockPaymentRepo.updateFromWebhook.mockResolvedValue({ id: 'pay-001', status: 'SUCCESS' });

        const result = await webhookService.processEvent(eventSinPaymentId as any);

        expect(result.processed).toBe(true);
        expect(mockInvoiceRepo.findByBoldLink).toHaveBeenCalled();
    });
});
