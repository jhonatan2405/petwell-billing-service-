import { Router } from 'express';
import { Request, Response } from 'express';
import { PricingService } from '../services/pricing.service';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { JwtPayload } from '../utils/jwt.util';
import { sendSuccess, sendError } from '../utils/response.util';

const router = Router();
const pricingService = new PricingService();

/**
 * GET /api/v1/billing/pricing/:clinicId
 * Public within the microservice ecosystem — appointment-service needs this without user context.
 * Still requires JWT for the gateway (frontend calls).
 */
router.get('/:clinicId', authenticate, async (req: Request, res: Response) => {
    try {
        const pricing = await pricingService.getByClinic(req.params.clinicId);
        sendSuccess(res, pricing, 'Precios obtenidos');
    } catch (err: unknown) {
        const e = err as { message?: string; statusCode?: number };
        sendError(res, e.message ?? 'Error obteniendo precios', e.statusCode ?? 500);
    }
});

/**
 * POST /api/v1/billing/pricing
 * Body: { clinic_id, price_consulta, price_telemedicina, price_urgencia, price_vacunacion }
 * Only CLINIC_ADMIN or PETWELL_ADMIN can set prices.
 */
router.post(
    '/',
    authenticate,
    authorize('CLINIC_ADMIN', 'PETWELL_ADMIN'),
    async (req: Request, res: Response) => {
        const user = req.user as JwtPayload;
        try {
            const pricing = await pricingService.upsert(req.body, user.clinic_id, user.role);
            sendSuccess(res, pricing, 'Precios guardados', 200);
        } catch (err: unknown) {
            const e = err as { message?: string; statusCode?: number };
            sendError(res, e.message ?? 'Error guardando precios', e.statusCode ?? 500);
        }
    }
);

export default router;
