import { MockIncomeTaxConfigRepository } from './MockIncomeTaxConfigRepository';
import { MockTaxComputationRepository } from './MockTaxComputationRepository';

/**
 * Single shared in-memory repository instances for the Income Tax feature —
 * same "one source of truth per entity type for the lifetime of the app
 * session" rationale as src/features/assets/repositories/instances.ts.
 */
export const incomeTaxConfigRepository = new MockIncomeTaxConfigRepository();
export const taxComputationRepository = new MockTaxComputationRepository();
