import { Request, Response } from 'express';
import { validateBoldSignature } from '../utils/bold.util';
import { WebhookService } from '../services/webhook.service';
import { env } from '../config/env';
import { sendError } from '../utils/response.util';

const webhookService = new WebhookService();

// ─── Webhook Controller ───────────────────────────────────────────────────────

export const webhookController = {

    /**
     * POST /api/v1/billing/payments/webhook
     *
     * Recibe eventos de Bold Checkout.
     * CRÍTICO: Siempre responde HTTP 200 para que Bold no reintente el envío.
     * Los errores internos se loggean pero no se propagan al response.
     *
     * Headers esperados:
     *   x-bold-signature: <hmac-sha256 del body en base64>
     *
     * Eventos manejados:
     *   SALE_APPROVED  → marca factura PAID, confirma cita
     *   (otros)        → ignorados silenciosamente
     */
    async handle(req: Request, res: Response): Promise<void> {
        const signature = req.headers['x-bold-signature'] as string | undefined;
        // rawBody fue adjuntado por el middleware express.raw() antes de parsear JSON
        const rawBody   = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));

        // ── 2. Parsear el body para extraer el ID ────────────────────────────
        let event: Record<string, unknown>;
        try {
            if (Buffer.isBuffer(req.body)) {
                event = JSON.parse(req.body.toString('utf8'));
            } else {
                event = req.body as Record<string, unknown>;
            }
        } catch {
            console.error('[WEBHOOK] ❌ Body no es JSON válido');
            res.status(400).json({ received: false, reason: 'invalid_json' });
            return;
        }

        // ── 1. Validar firma HMAC o usar Fallback ─────────────────────────────
        let isTrusted = false;

        if (signature) {
            isTrusted = validateBoldSignature(rawBody, signature, env.BOLD_API_SECRET);
            if (!isTrusted) {
                console.warn('[WEBHOOK] ⚠️  Firma inválida con BOLD_API_SECRET. Iniciando fallback...');
            }
        } else if (!env.DISABLE_WEBHOOK_SIGNATURE) {
            console.warn('[WEBHOOK] ⚠️  Sin x-bold-signature header. Iniciando fallback...');
        } else {
            // Firma deshabilitada por .env
            isTrusted = true;
        }

        // ── FALLBACK: Verificar directo con Bold usando API_KEY ───────────────
        if (!isTrusted && !env.DISABLE_WEBHOOK_SIGNATURE) {
            const notificationId = event.id as string | undefined;
            if (!notificationId) {
                console.error('[WEBHOOK] ❌ Sin firma y sin ID de notificación para validar. Rechazado.');
                sendError(res, 'Sin firma y sin ID para verificación', 400);
                return;
            }

            try {
                console.log(`[WEBHOOK] 🔄 Verificando notificación con Bold API: ${notificationId}`);
                const boldRes = await fetch(`https://integrations.api.bold.co/payments/webhook/notifications/${notificationId}`, {
                    headers: { 'Authorization': `Api-Key ${env.BOLD_API_KEY}` }
                });

                if (boldRes.ok) {
                    const trueEvent = await boldRes.json() as Record<string, unknown>;
                    console.log(`[WEBHOOK] ✅ Verificación exitosa vía internet — evento es real`);
                    event = trueEvent; // Reemplazamos con los datos canónicos
                    isTrusted = true;
                } else {
                    console.error(`[WEBHOOK] ❌ Error verificando con Bold: HTTP ${boldRes.status}`);
                }
            } catch (err) {
                console.error(`[WEBHOOK] ❌ Fallo de red intentando verificar con Bold:`, err);
            }

            if (!isTrusted) {
                console.warn('[WEBHOOK] ❌ Fallback fracasó. Solicitud rechazada definitivamente.');
                sendError(res, 'Firma y fallback fallidos', 400);
                return;
            }
        }

        // ── 3. RESPONDER RÁPIDO (< 2 seg) ─────────────────────────────────────
        res.status(200).json({ received: true });

        // ── 4. Procesar asíncronamente en background ──────────────────────────
        // (nunca bloquea el request inicial para evitar retries de Bold)
        webhookService.processEvent(event as unknown as Parameters<typeof webhookService.processEvent>[0])
            .catch(err => {
                console.error('[WEBHOOK] ❌ Error asíncrono no manejado:', err);
            });
    },
};
