import { supabase } from '../config/supabase';
import { ClinicPricing, UpsertClinicPricingDTO } from '../models/pricing.model';

const TABLE = 'clinic_pricing';

export class PricingRepository {

    async findByClinic(clinicId: string): Promise<ClinicPricing | null> {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .eq('clinic_id', clinicId)
            .maybeSingle();
        if (error) return null;
        return data as ClinicPricing | null;
    }

    /**
     * Upsert: inserts or updates pricing for the clinic.
     * Uses ON CONFLICT (clinic_id) DO UPDATE.
     */
    async upsert(dto: UpsertClinicPricingDTO): Promise<ClinicPricing> {
        const { data, error } = await supabase
            .from(TABLE)
            .upsert(
                {
                    clinic_id:          dto.clinic_id,
                    price_consulta:     dto.price_consulta,
                    price_telemedicina: dto.price_telemedicina,
                    price_urgencia:     dto.price_urgencia,
                    price_vacunacion:   dto.price_vacunacion,
                },
                { onConflict: 'clinic_id' }
            )
            .select()
            .single();

        if (error) throw new Error(`Error guardando precios: ${error.message}`);
        return data as ClinicPricing;
    }
}
