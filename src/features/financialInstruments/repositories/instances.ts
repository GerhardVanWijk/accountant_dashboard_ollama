import { SupabaseEclComputationRepository } from './SupabaseEclComputationRepository';
import { supabase } from '@/config/supabase';

/** Single shared repository instance for the Financial Instruments (ECL) feature — same rationale as src/features/tax/deferredTax/repositories/instances.ts. Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase F. */
export const eclComputationRepository = new SupabaseEclComputationRepository(supabase);
