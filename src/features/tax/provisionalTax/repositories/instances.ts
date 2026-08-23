import { SupabaseProvisionalTaxPeriodRepository } from './SupabaseProvisionalTaxPeriodRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instance for the Provisional Tax feature —
 * same "one source of truth per entity type for the lifetime of the app
 * session" rationale as src/features/tax/incomeTax/repositories/instances.ts.
 * Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase F.
 */
export const provisionalTaxPeriodRepository = new SupabaseProvisionalTaxPeriodRepository(supabase);
