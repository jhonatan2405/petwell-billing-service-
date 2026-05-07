import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import promBundle from 'express-prom-bundle';
import { env } from './config/env';
import billingRoutes from './routes/billing.routes';
import pricingRoutes from './routes/pricing.routes';
import webhookRoutes from './routes/webhook.routes';

const app = express();

// ─── Security & Logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));

// ─── Prometheus Metrics ─────────────────────────────────────────────────────
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  promClient: { collectDefaultMetrics: {} },
});
app.use(metricsMiddleware as any);

// ─── Webhook Route (debe ir ANTES de express.json para validar firma HMAC) ─────
app.use('/api/v1/billing/payments/webhook', webhookRoutes);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'billing-service', port: env.PORT });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/billing/pricing', pricingRoutes);


// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(env.PORT, () => {
    console.log(`✅ Billing Service running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`   Bold Checkout: ${env.BOLD_CHECKOUT_URL}`);
});

export default app;
