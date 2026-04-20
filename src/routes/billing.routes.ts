import { Router } from 'express';
import { invoiceController, paymentController } from '../controllers/billing.controller';
import { authenticate, authenticateService } from '../middlewares/auth.middleware';

const router = Router();

// ─── Invoices ─────────────────────────────────────────────────────────────────


/**
 * POST /api/v1/billing/invoices
 * Internal only — called by appointment-service via X-Internal-Service-Key.
 */
router.post(
    '/invoices',
    authenticateService,
    invoiceController.create
);

/**
 * GET /api/v1/billing/invoices
 * All authenticated roles — filtered by role in the service layer.
 */
router.get(
    '/invoices',
    authenticate,
    invoiceController.list
);

/**
 * GET /api/v1/billing/invoices/:id
 */
router.get(
    '/invoices/:id',
    authenticate,
    invoiceController.getById
);

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/billing/payments/init
 * Authenticated users — generates a Bold Checkout URL.
 */
router.post(
    '/payments/init',
    authenticate,
    paymentController.init
);

/**
 * POST /api/v1/billing/payments/confirm
 * @deprecated Mantenido para retrocompatibilidad. El flujo principal usa webhooks.
 * Permite confirmación manual si el webhook falla (fallback).
 */
router.post(
    '/payments/confirm',
    authenticate,
    paymentController.confirm
);

export default router;
