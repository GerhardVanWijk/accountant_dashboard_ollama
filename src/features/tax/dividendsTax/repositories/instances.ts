import { SupabaseDividendsWithholdingTaxConfigRepository } from './SupabaseDividendsWithholdingTaxConfigRepository';
import { SupabaseDividendDeclarationRepository } from './SupabaseDividendDeclarationRepository';
import { supabase } from '@/config/supabase';

/**
 * Single shared repository instances for the whole dividendsTax feature —
 * same "one source of truth per entity type for the lifetime of the app
 * session" rationale as src/features/assets/repositories/instances.ts.
 * Both Supabase-backed as of docs/SUPABASE_MIGRATION_GUIDE.md Phase F.
 */
export const dividendsWithholdingTaxConfigRepository = new SupabaseDividendsWithholdingTaxConfigRepository(supabase);
export const dividendDeclarationRepository = new SupabaseDividendDeclarationRepository(supabase);
