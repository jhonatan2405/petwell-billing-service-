import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

// ─── Webhook Bold (raw body para validar HMAC) ───────────
router.post(
    '/',
    express.raw({ type: 'application/json' }),
    (req: Request, _res: Response, next: NextFunction) => {
        // Adjuntar raw body para que el controller pueda validar la firma
        if (Buffer.isBuffer(req.body)) {
            (req as Request & { rawBody?: Buffer }).rawBody = req.body;
        }
        next();
    },
    webhookController.handle,
);

export default router;
