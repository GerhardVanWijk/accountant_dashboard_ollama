import { MockProvisionalTaxPeriodRepository } from './MockProvisionalTaxPeriodRepository';

/**
 * Single shared in-memory repository instance for the Provisional Tax
 * feature — same "one source of truth per entity type for the lifetime of
 * the app session" rationale as src/features/tax/incomeTax/repositories/instances.ts.
 */
export const provisionalTaxPeriodRepository = new MockProvisionalTaxPeriodRepository();
