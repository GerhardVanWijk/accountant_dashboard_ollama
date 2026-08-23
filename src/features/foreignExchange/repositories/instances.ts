import { SupabaseExchangeRateRepository } from './SupabaseExchangeRateRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instance for the Foreign Exchange feature — same
 * "one source of truth per entity type for the lifetime of the app session"
 * rationale as src/features/assets/repositories/instances.ts.
 * Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase G.
 */
export const exchangeRateRepository = new SupabaseExchangeRateRepository(supabase);
