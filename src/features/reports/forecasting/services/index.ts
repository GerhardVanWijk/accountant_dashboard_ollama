import { SupabaseFinancialPlanRepository } from '@/repositories/SupabaseFinancialPlanRepository';
import { supabase } from '@/config/supabase';
import { FinancialPlanService } from './financialPlanService';

export { FinancialPlanService, type UpsertPlanLineDTO } from './financialPlanService';
export * from './computeForecastReport';

const financialPlanRepository = new SupabaseFinancialPlanRepository(supabase);

export const financialPlanService = new FinancialPlanService(financialPlanRepository);
