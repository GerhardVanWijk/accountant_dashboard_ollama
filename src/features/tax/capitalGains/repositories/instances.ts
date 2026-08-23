import { SupabaseCgtInclusionRateConfigRepository } from './SupabaseCgtInclusionRateConfigRepository';
import { SupabaseCgtAnnualExclusionConfigRepository } from './SupabaseCgtAnnualExclusionConfigRepository';
import { SupabaseCgtDisposalAdjustmentRepository } from './SupabaseCgtDisposalAdjustmentRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the whole capital gains feature —
 * same "one source of truth per entity type for the lifetime of the app
 * session" rationale as src/features/assets/repositories/instances.ts.
 * All three Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase F.
 */
export const cgtInclusionRateConfigRepository = new SupabaseCgtInclusionRateConfigRepository(supabase);
export const cgtAnnualExclusionConfigRepository = new SupabaseCgtAnnualExclusionConfigRepository(supabase);
export const cgtDisposalAdjustmentRepository = new SupabaseCgtDisposalAdjustmentRepository(supabase);
