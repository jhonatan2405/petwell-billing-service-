import { PricingRepository } from '../repositories/pricing.repository';
import { ClinicPricing, UpsertClinicPricingDTO } from '../models/pricing.model';

const repo = new PricingRepository();

const DEFAULT_PRICING: Omit<ClinicPricing, 'id' | 'clinic_id' | 'updated_at'> = {
    price_consulta:     0,
    price_telemedicina: 0,
    price_urgencia:     0,
    price_vacunacion:   0,
};

export class PricingService {

    async getByClinic(clinicId: string): Promise<ClinicPricing & { clinic_id: string }> {
        const pricing = await repo.findByClinic(clinicId);
        if (!pricing) {
            // Return default values instead of 404
            return {
                id:                 '',
                clinic_id:          clinicId,
                updated_at:         new Date().toISOString(),
                ...DEFAULT_PRICING,
            };
        }
        return pricing;
    }

    async upsert(
        dto: UpsertClinicPricingDTO,
        requesterClinicId?: string,
        requesterRole?: string,
    ): Promise<ClinicPricing> {
        // CLINIC_ADMIN can only edit their own clinic
        if (requesterRole === 'CLINIC_ADMIN' && requesterClinicId && dto.clinic_id !== requesterClinicId) {
            throw Object.assign(new Error('Solo puedes configurar los precios de tu propia clínica'), { statusCode: 403 });
        }

        const prices = [dto.price_consulta, dto.price_telemedicina, dto.price_urgencia, dto.price_vacunacion];
        if (prices.some(p => p < 0)) {
            throw Object.assign(new Error('Los precios no pueden ser negativos'), { statusCode: 400 });
        }

        return repo.upsert(dto);
    }
}
