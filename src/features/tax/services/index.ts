import { TaxRateService } from './taxRateService';
import { SupabaseTaxRateRepository } from '@/repositories/SupabaseTaxRateRepository';
import { supabase } from '@/config/supabase';
import { auditLogService } from '@/services/auditLogService';

export type { CreateTaxRateDTO, SupersedeTaxRateInput } from './taxRateService';
export { TaxRateService } from './taxRateService';
export { MockTaxRateRepository } from '@/repositories/mock/MockTaxRateRepository';

/**
 * Supabase-wired (2026-09-03). Previously Mock-wired: the app-wide singleton
 * read the hand-typed `src/mock-data/taxRates.ts` fixtures (ids like
 * `"tax_std_v2"`) while every real document/product is Supabase-backed and
 * carries a real `tax_rate_id` UUID. Those two id spaces never intersect,
 * so `getTaxRateLabel()` and every "pick a rate" dropdown showed
 * "Unknown tax rate" against real data in the deployed app. The historical
 * blocker — "the Supabase `tax_rates` table is correctly empty" — no longer
 * holds: the Office National demo seeded the real STD / ZERO / EXEMPT rows
 * (2026-08-28). Service tests that used to import this live singleton now
 * construct their own `new TaxRateService(new MockTaxRateRepository(), …)`
 * (see `MockTaxRateRepository` re-export above), matching every other
 * Supabase-wired service barrel's test convention.
 */
export const taxRateService = new TaxRateService(new SupabaseTaxRateRepository(supabase), auditLogService);
