import { SupabaseLeaseRepository } from './SupabaseLeaseRepository';
import { SupabaseLeaseAmortizationEntryRepository } from './SupabaseLeaseAmortizationEntryRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the whole leases feature — same
 * "one source of truth per entity type for the lifetime of the app session"
 * rationale as src/features/assets/repositories/instances.ts.
 * Both Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase G.
 */
export const leaseRepository = new SupabaseLeaseRepository(supabase);
export const leaseAmortizationEntryRepository = new SupabaseLeaseAmortizationEntryRepository(supabase);
