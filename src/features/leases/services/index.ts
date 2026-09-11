import { LeaseService } from './leaseService';
import { LeaseAmortizationService } from './leaseAmortizationService';
import { LeaseDisposalService } from './leaseDisposalService';
import { RealLeaseCommencementExecutor } from './leaseCommencementExecutor';
import { RealLeaseAmortizationPeriodExecutor } from './leaseAmortizationPeriodExecutor';
import { RealLeaseTerminationExecutor } from './leaseTerminationExecutor';
import { RealLeasePeriodSettlementExecutor } from './leasePeriodSettlementExecutor';
import { leaseRepository, leaseAmortizationEntryRepository } from '../repositories/instances';
import { accountMappingService } from '@/features/accounting/services';
import { supabase } from '@/config/supabase';

export type { CreateLeaseDTO, UpdateLeaseDTO } from './leaseService';
export type { LeaseAmortizationRunResult, LeaseAmortizationPreviewRow } from './leaseAmortizationService';
export {
  calculateLeaseLiabilityPresentValue,
  calculateMonthlyAmortization,
  calculateStraightLineRouDepreciation,
  calculateCurrentPortionOfLiability,
  calculateCurrentPortionForLease,
  projectLeasePaymentSchedule,
  round2,
  EPSILON,
} from './leaseCalculations';
export type { LeasePaymentScheduleRow } from './leaseCalculations';
export { LeaseService } from './leaseService';
export { LeaseAmortizationService } from './leaseAmortizationService';
export { LeaseDisposalService } from './leaseDisposalService';
export { reconcileLeaseRegisterToGl } from './leaseReconciliationService';
export type { LeaseRegisterReconciliation, LeaseGlAccountLine } from './leaseReconciliationService';

/**
 * Wires the services to their shared Supabase repositories and the atomic
 * RPC executors (Leases + Payroll integrity audit, PART 1 — migrations
 * 0088/0089/0090) — commencement/amortization run/termination each post
 * their journal and mutate the lease register in ONE database transaction,
 * so a lease is never left half-posted by a partial write. Hooks depend on
 * these singletons instead of importing repositories directly.
 */
export const leaseService = new LeaseService(leaseRepository, new RealLeaseCommencementExecutor(supabase), accountMappingService);
export const leaseAmortizationService = new LeaseAmortizationService(
  leaseAmortizationEntryRepository,
  leaseRepository,
  new RealLeaseAmortizationPeriodExecutor(supabase),
  accountMappingService,
  new RealLeasePeriodSettlementExecutor(supabase),
);
export const leaseDisposalService = new LeaseDisposalService(leaseRepository, new RealLeaseTerminationExecutor(supabase), accountMappingService);
