import { SupabaseFixedAssetRepository } from './SupabaseFixedAssetRepository';
import { SupabaseDepreciationEntryRepository } from './SupabaseDepreciationEntryRepository';
import { SupabaseAssetDisposalRepository } from './SupabaseAssetDisposalRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the whole assets feature — same
 * "one source of truth per entity type for the lifetime of the app
 * session" rationale as src/features/inventory/repositories/instances.ts.
 * All three Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase F.
 */
export const fixedAssetRepository = new SupabaseFixedAssetRepository(supabase);
export const depreciationEntryRepository = new SupabaseDepreciationEntryRepository(supabase);
export const assetDisposalRepository = new SupabaseAssetDisposalRepository(supabase);
