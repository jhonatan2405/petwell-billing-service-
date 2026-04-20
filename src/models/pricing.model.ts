export interface ClinicPricing {
    id: string;
    clinic_id: string;
    price_consulta: number;
    price_telemedicina: number;
    price_urgencia: number;
    price_vacunacion: number;
    updated_at: string;
}

export interface UpsertClinicPricingDTO {
    clinic_id: string;
    price_consulta: number;
    price_telemedicina: number;
    price_urgencia: number;
    price_vacunacion: number;
}
