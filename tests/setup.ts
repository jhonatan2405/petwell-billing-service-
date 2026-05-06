/**
 * tests/setup.ts
 *
 * Establece variables de entorno mínimas necesarias para que los módulos
 * de src/ se inicialicen correctamente durante las pruebas, SIN conectarse
 * a ninguna base de datos ni servicio externo real.
 */

process.env['NODE_ENV']                  = 'test';
process.env['PORT']                      = '0'; // random free port per worker → no EADDRINUSE
process.env['JWT_SECRET']                = 'test_jwt_secret_superseguro_para_pruebas';
process.env['SUPABASE_URL']              = 'https://fake-supabase.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'fake_supabase_service_role_key';
process.env['INTERNAL_SERVICE_KEY']      = 'petwell_internal_secret';
process.env['BOLD_CHECKOUT_URL']         = 'https://checkout.bold.co/payment/LNK_TEST123';
process.env['BOLD_API_SECRET']           = 'bold_test_secret';
process.env['BOLD_API_KEY']              = 'bold_test_api_key';
process.env['DISABLE_WEBHOOK_SIGNATURE'] = 'true';
process.env['ALLOWED_ORIGINS']           = 'http://localhost:3000';
process.env['APPOINTMENT_SERVICE_URL']   = 'http://localhost:3005';
