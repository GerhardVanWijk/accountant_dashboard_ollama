import { MockCgtInclusionRateConfigRepository } from './MockCgtInclusionRateConfigRepository';
import { MockCgtAnnualExclusionConfigRepository } from './MockCgtAnnualExclusionConfigRepository';
import { MockCgtDisposalAdjustmentRepository } from './MockCgtDisposalAdjustmentRepository';

/**
 * Single shared in-memory repository instances for the whole capital
 * gains feature — same "one source of truth per entity type for the
 * lifetime of the app session" rationale as
 * src/features/assets/repositories/instances.ts.
 */
export const cgtInclusionRateConfigRepository = new MockCgtInclusionRateConfigRepository();
export const cgtAnnualExclusionConfigRepository = new MockCgtAnnualExclusionConfigRepository();
export const cgtDisposalAdjustmentRepository = new MockCgtDisposalAdjustmentRepository();
