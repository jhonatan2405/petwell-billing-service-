import { Request, Response } from 'express';
import { InvoiceService, PaymentService } from '../services/billing.service';
import { JwtPayload } from '../utils/jwt.util';
import { sendSuccess, sendError } from '../utils/response.util';

const invoiceService = new InvoiceService();
const paymentService = new PaymentService();

// ─── Invoice Controller ───────────────────────────────────────────────────────

export const invoiceController = {

    /**
     * POST /api/v1/billing/invoices
     * Internal endpoint — called by appointment-service via X-Internal-Service-Key.
     * Body: { clinic_id, owner_id, appointment_id?, total_amount, description? }
     */
    async create(req: Request, res: Response): Promise<void> {
        // When called internally, req.user is not set. We skip clinic_id check.
        const user = req.user as JwtPayload | undefined;
        try {
            const invoice = await invoiceService.createInvoice(req.body, user?.clinic_id);
            sendSuccess(res, invoice, 'Factura creada', 201);
        } catch (err: unknown) {
            const e = err as { message?: string; statusCode?: number };
            sendError(res, e.message ?? 'Error creando factura', e.statusCode ?? 500);
        }
    },

    /**
     * GET /api/v1/billing/invoices
     */
    async list(req: Request, res: Response): Promise<void> {
        const user = req.user as JwtPayload;
        try {
            const invoices = await invoiceService.getInvoices(user.role, user.sub ?? user.id ?? '', user.clinic_id);
            sendSuccess(res, invoices, 'Facturas listadas');
        } catch (err: unknown) {
            const e = err as { message?: string; statusCode?: number };
            sendError(res, e.message ?? 'Error listando facturas', e.statusCode ?? 500);
        }
    },

    /**
     * GET /api/v1/billing/invoices/:id
     */
    async getById(req: Request, res: Response): Promise<void> {
        const user = req.user as JwtPayload;
        try {
            const invoice = await invoiceService.getInvoiceById(
                req.params.id, user.role, user.sub ?? user.id ?? '', user.clinic_id
            );
            sendSuccess(res, invoice, 'Factura encontrada');
        } catch (err: unknown) {
            const e = err as { message?: string; statusCode?: number };
            sendError(res, e.message ?? 'Error obteniendo factura', e.statusCode ?? 500);
        }
    },
};

// ─── Payment Controller ───────────────────────────────────────────────────────

export const paymentController = {

    /**
     * POST /api/v1/billing/payments/init
     * Body: { invoice_id }
     * Returns { redirect_url } pointing to Bold Checkout.
     */
    async init(req: Request, res: Response): Promise<void> {
        const user = req.user as JwtPayload;
        const { invoice_id } = req.body;

        if (!invoice_id) {
            sendError(res, 'invoice_id es requerido', 400);
            return;
        }

        try {
            const result = await paymentService.initiatePayment(
                invoice_id,
                user.sub ?? user.id ?? '',
                user.role,
            );
            sendSuccess(res, result, 'URL de pago generada');
        } catch (err: unknown) {
            const e = err as { message?: string; statusCode?: number };
            sendError(res, e.message ?? 'Error generando URL de pago', e.statusCode ?? 500);
        }
    },

    /**
     * POST /api/v1/billing/payments/confirm
     * Called by the frontend after Bold redirects back with status=approved.
     * Body: { invoice_id, reference }
     */
    async confirm(req: Request, res: Response): Promise<void> {
        const { invoice_id, reference } = req.body;

        if (!invoice_id || !reference) {
            sendError(res, 'invoice_id y reference son requeridos', 400);
            return;
        }

        try {
            await paymentService.confirmPayment(invoice_id, reference);
            sendSuccess(res, null, 'Pago confirmado y cita agendada');
        } catch (err: unknown) {
            const e = err as { message?: string; statusCode?: number };
            sendError(res, e.message ?? 'Error confirmando pago', e.statusCode ?? 500);
        }
    },
};
