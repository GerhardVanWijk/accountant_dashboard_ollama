import { TaxRateService } from './taxRateService';
import { MockTaxRateRepository } from '@/repositories/mock/MockTaxRateRepository';
import { auditLogService } from '@/services/auditLogService';

export type { CreateTaxRateDTO, SupersedeTaxRateInput } from './taxRateService';
export { TaxRateService } from './taxRateService';

/**
 * Stays Mock-wired — SupabaseTaxRateRepository is fully built and verified
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase D), but wiring it in was tried
 * again in Phase E and reverted a second time, with a corrected reason.
 * Phase D's original theory — "flip it once Sales/Purchases migrate too,
 * so both sides reference the same real rows" — turned out to be wrong:
 * migrating Purchases to Supabase (Phase E) changes WHERE `billService`
 * reads from, not WHAT data exists there. `billService.test.ts`'s fixtures
 * reference specific Mock-seeded tax rate ids (e.g. `"tax_std_v2"`); no
 * schema/repository change makes a matching row exist in the (correctly
 * empty) Supabase `tax_rates` table. Swapping this again reproduced the
 * exact same 6 `billService.test.ts` failures Phase D already documented.
 * The real fix isn't a wiring order — it's either seeding real reference
 * data into Supabase, or moving these tests off the shared live singleton
 * onto locally-constructed fixtures, both out of a schema-migration
 * phase's scope. Revisit when there's an actual seeding/test-data strategy,
 * not just "the next phase migrates."
 */
export const taxRateService = new TaxRateService(new MockTaxRateRepository(), auditLogService);
