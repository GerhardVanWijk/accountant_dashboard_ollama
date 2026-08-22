import { MockDividendsWithholdingTaxConfigRepository } from './MockDividendsWithholdingTaxConfigRepository';
import { MockDividendDeclarationRepository } from './MockDividendDeclarationRepository';

/**
 * Single shared in-memory repository instances for the whole
 * dividendsTax feature — same "one source of truth per entity type for
 * the lifetime of the app session" rationale as
 * src/features/assets/repositories/instances.ts.
 */
export const dividendsWithholdingTaxConfigRepository = new MockDividendsWithholdingTaxConfigRepository();
export const dividendDeclarationRepository = new MockDividendDeclarationRepository();
