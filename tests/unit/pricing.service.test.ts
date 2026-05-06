/**
 * tests/unit/pricing.service.test.ts
 *
 * Pruebas unitarias para PricingService.
 * Mockea completamente PricingRepository para no tocar Supabase.
 */

import { PricingService } from '../../src/services/pricing.service';
import { ClinicPricing } from '../../src/models/pricing.model';

// ─── Mock del repositorio de precios ─────────────────────────────────────────

jest.mock('../../src/repositories/pricing.repository', () => {
    const mockRepo = {
        findByClinic: jest.fn(),
        upsert:       jest.fn(),
    };
    return {
        PricingRepository: jest.fn(() => mockRepo),
        __mockRepo: mockRepo,
    };
});

import * as pricingRepo from '../../src/repositories/pricing.repository';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRepo = (pricingRepo as any).__mockRepo;

// ─── Fixture ──────────────────────────────────────────────────────────────────

const basePricing: ClinicPricing = {
    id:                 'pricing-uuid-001',
    clinic_id:          'clinic-001',
    price_consulta:     80000,
    price_telemedicina: 50000,
    price_urgencia:     120000,
    price_vacunacion:   40000,
    updated_at:         new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('PricingService', () => {
    let pricingService: PricingService;

    beforeEach(() => {
        jest.clearAllMocks();
        pricingService = new PricingService();
    });

    // ── getByClinic ────────────────────────────────────────────────────────────

    describe('getByClinic', () => {
        it('retorna los precios cuando la clínica tiene configuración guardada', async () => {
            mockRepo.findByClinic.mockResolvedValue(basePricing);

            const result = await pricingService.getByClinic('clinic-001');

            // Matcher: toEqual — verifica estructura completa
            expect(result).toEqual(basePricing);
            // Matcher: toHaveProperty — verifica campo específico
            expect(result).toHaveProperty('clinic_id', 'clinic-001');
            expect(result).toHaveProperty('price_consulta', 80000);
        });

        it('retorna precios por defecto (todos 0) cuando la clínica no tiene configuración', async () => {
            mockRepo.findByClinic.mockResolvedValue(null);

            const result = await pricingService.getByClinic('clinic-nueva');

            // Matcher: toBeDefined — verifica que existe el resultado
            expect(result).toBeDefined();
            // Matcher: toBe — comparación exacta
            expect(result.price_consulta).toBe(0);
            expect(result.price_telemedicina).toBe(0);
            expect(result.clinic_id).toBe('clinic-nueva');
        });
    });

    // ── upsert ────────────────────────────────────────────────────────────────

    describe('upsert', () => {
        const validDto = {
            clinic_id:          'clinic-001',
            price_consulta:     90000,
            price_telemedicina: 55000,
            price_urgencia:     130000,
            price_vacunacion:   45000,
        };

        it('guarda precios exitosamente para PETWELL_ADMIN', async () => {
            mockRepo.upsert.mockResolvedValue({ ...basePricing, ...validDto });

            const result = await pricingService.upsert(validDto, undefined, 'PETWELL_ADMIN');

            expect(result).toBeDefined();
            expect(result).toHaveProperty('price_consulta', 90000);
            expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
        });

        it('permite a CLINIC_ADMIN actualizar su propia clínica', async () => {
            mockRepo.upsert.mockResolvedValue(basePricing);

            // Prueba async con resolves
            await expect(
                pricingService.upsert(validDto, 'clinic-001', 'CLINIC_ADMIN')
            ).resolves.toBeDefined();
        });

        it('lanza error 403 si CLINIC_ADMIN intenta editar otra clínica', async () => {
            // Prueba async con rejects
            await expect(
                pricingService.upsert(
                    { ...validDto, clinic_id: 'clinic-ajena' },
                    'clinic-001',      // requesterClinicId
                    'CLINIC_ADMIN',
                )
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        it('lanza error 400 si algún precio es negativo', async () => {
            await expect(
                pricingService.upsert(
                    { ...validDto, price_consulta: -100 },
                    undefined,
                    'PETWELL_ADMIN',
                )
            ).rejects.toMatchObject({ statusCode: 400 });
        });
    });
});
