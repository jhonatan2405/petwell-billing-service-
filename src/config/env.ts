import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string, fallback?: string): string {
    const val = process.env[key] ?? fallback;
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}

export const env = {
    PORT:                    parseInt(process.env['PORT'] ?? '3009', 10),
    NODE_ENV:                process.env['NODE_ENV'] ?? 'development',

    JWT_SECRET:              requireEnv('JWT_SECRET'),
    SUPABASE_URL:            requireEnv('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),

    ALLOWED_ORIGINS:         process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000',

    // Bold Checkout
    BOLD_API_SECRET:         process.env['BOLD_API_SECRET'] ?? '',
    BOLD_API_KEY:            process.env['BOLD_API_KEY'] ?? '',
    BOLD_CHECKOUT_URL:       process.env['BOLD_CHECKOUT_URL'] ?? 'https://checkout.bold.co/payment/link',
    DISABLE_WEBHOOK_SIGNATURE: process.env['DISABLE_WEBHOOK_SIGNATURE'] === 'true',

    // Inter-service
    APPOINTMENT_SERVICE_URL:  process.env['APPOINTMENT_SERVICE_URL'] ?? 'http://localhost:3005',
    NOTIFICATION_SERVICE_URL: process.env['NOTIFICATION_SERVICE_URL'] ?? 'http://localhost:3007',
    INTERNAL_SERVICE_KEY:     process.env['INTERNAL_SERVICE_KEY'] ?? 'petwell_internal_secret',

    FRONTEND_URL:            process.env['FRONTEND_URL'] ?? 'http://localhost:3000',
};
