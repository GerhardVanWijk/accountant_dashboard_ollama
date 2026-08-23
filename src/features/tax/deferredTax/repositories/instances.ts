import { SupabaseDeferredTaxComputationRepository } from './SupabaseDeferredTaxComputationRepository';
import { supabase } from '@/config/supabase';

/** Single shared repository instance for the Deferred Tax feature — same rationale as src/features/tax/incomeTax/repositories/instances.ts. Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase F. */
export const deferredTaxComputationRepository = new SupabaseDeferredTaxComputationRepository(supabase);
