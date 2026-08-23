import { SupabaseIncomeTaxConfigRepository } from './SupabaseIncomeTaxConfigRepository';
import { SupabaseTaxComputationRepository } from './SupabaseTaxComputationRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the Income Tax feature — same
 * "one source of truth per entity type for the lifetime of the app
 * session" rationale as src/features/assets/repositories/instances.ts.
 * Both Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase F.
 */
export const incomeTaxConfigRepository = new SupabaseIncomeTaxConfigRepository(supabase);
export const taxComputationRepository = new SupabaseTaxComputationRepository(supabase);
