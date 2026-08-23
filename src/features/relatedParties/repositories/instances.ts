import { SupabaseRelatedPartyRepository } from './SupabaseRelatedPartyRepository';
import { SupabaseRelatedPartyTransactionRepository } from './SupabaseRelatedPartyTransactionRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the whole relatedParties feature —
 * same "one source of truth per entity type for the lifetime of the app
 * session" rationale as src/features/assets/repositories/instances.ts.
 * Both Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase G.
 */
export const relatedPartyRepository = new SupabaseRelatedPartyRepository(supabase);
export const relatedPartyTransactionRepository = new SupabaseRelatedPartyTransactionRepository(supabase);
