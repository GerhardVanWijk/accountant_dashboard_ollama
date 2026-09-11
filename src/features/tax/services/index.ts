import { TaxRateService } from './taxRateService';
import { VatSourceEntryService } from './vatSourceEntryService';
import { SupabaseTaxRateRepository } from '@/repositories/SupabaseTaxRateRepository';
import { SupabaseVatSourceEntryRepository } from '../repositories/SupabaseVatSourceEntryRepository';
import { supabase } from '@/config/supabase';
import { auditLogService } from '@/services/auditLogService';

export type { CreateTaxRateDTO, SupersedeTaxRateInput } from './taxRateService';
export { TaxRateService } from './taxRateService';
export { VatSourceEntryService } from './vatSourceEntryService';
export { MockTaxRateRepository } from '@/repositories/mock/MockTaxRateRepository';
export { MockVatSourceEntryRepository } from '../repositories/MockVatSourceEntryRepository';

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

/**
 * Persisted VAT source/evidence ledger (migration 0080) — taxable events
 * that originate outside the Invoice/Credit Note/Supplier Invoice pipeline
 * (fixed-asset disposals today). The VAT report reads these alongside its
 * document sources so a disposal's output VAT reaches the return and the
 * VAT control-account reconciliation.
 */
export const vatSourceEntryRepository = new SupabaseVatSourceEntryRepository(supabase);
export const vatSourceEntryService = new VatSourceEntryService(vatSourceEntryRepository);
