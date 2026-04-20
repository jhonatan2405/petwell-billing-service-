import crypto from 'crypto';

import { env } from '../config/env';

/**
 * Valida la firma HMAC-SHA256 del webhook de Bold.
 *
 * Bold genera la firma así:
 *   1. Toma el cuerpo de la petición como string (raw body).
 *   2. Lo codifica en Base64.
 *   3. Genera HMAC-SHA256 con BOLD_API_SECRET (o con '' en pruebas).
 *   4. Envía el resultado en el header `x-bold-signature` en formato HEX.
 *
 * @param rawBody   Buffer/string del body crudo (antes de parsear JSON)
 * @param signature Valor del header `x-bold-signature` en HEX
 * @param secret    String: BOLD_API_SECRET
 * @returns         true si la firma es válida
 */
export function validateBoldSignature(
    rawBody: Buffer | string,
    signature: string,
    secret: string,
): boolean {
    if (env.DISABLE_WEBHOOK_SIGNATURE) {
        console.warn('[WEBHOOK] ⚠️  DISABLE_WEBHOOK_SIGNATURE=true — ignorando validación');
        return true;
    }

    try {
        // 1. Convertir a string
        const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
        
        // 2. Base64
        const base64Body = Buffer.from(bodyStr, 'utf8').toString('base64');
        const sigBuffer = Buffer.from(signature, 'hex');

        // Función auxiliar para comparar firmas
        const checkSig = (key: string) => {
            const expectedSig = crypto.createHmac('sha256', key).update(base64Body).digest('hex');
            const expectedBuffer = Buffer.from(expectedSig, 'hex');
            if (sigBuffer.length !== expectedBuffer.length) return false;
            return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
        };

        // 3. Probar con llave principal
        if (checkSig(secret)) {
            console.log('[WEBHOOK] Firma válida con BOLD_API_SECRET');
            return true;
        }

        // 4. Probar con cadena vacía (Bold Entorno de Pruebas: Test Event en su dashboard)
        if (checkSig('')) {
            console.log('[WEBHOOK] Firma válida con cadena vacía (entorno de pruebas Bold)');
            return true;
        }

        console.error('[WEBHOOK] ❌ Firma inválida');
        return false;
    } catch (err) {
        console.error('[WEBHOOK] Error procesando firma HMAC:', err);
        return false;
    }
}
