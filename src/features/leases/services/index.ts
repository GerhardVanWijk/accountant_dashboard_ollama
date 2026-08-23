import { LeaseService } from './leaseService';
import { LeaseAmortizationService } from './leaseAmortizationService';
import { LeaseDisposalService } from './leaseDisposalService';
import { leaseRepository, leaseAmortizationEntryRepository } from '../repositories/instances';
import { journalEntryService, accountMappingService } from '@/features/accounting/services';

export type { CreateLeaseDTO, UpdateLeaseDTO } from './leaseService';
export type { LeaseAmortizationRunResult } from './leaseAmortizationService';
export {
  calculateLeaseLiabilityPresentValue,
  calculateMonthlyAmortization,
  calculateStraightLineRouDepreciation,
  calculateCurrentPortionOfLiability,
  calculateCurrentPortionForLease,
  round2,
  EPSILON,
} from './leaseCalculations';
export { LeaseService } from './leaseService';
export { LeaseAmortizationService } from './leaseAmortizationService';
export { LeaseDisposalService } from './leaseDisposalService';

/**
 * Wires the services to their shared mock repositories and the real GL
 * posting engine (journalEntryService) — the same singleton every other
 * posting module uses, so a lease commencement/amortization run/
 * termination is immediately visible in the trial balance and subject to
 * accountingPeriodService's period-open rule. Hooks depend on these
 * singletons instead of importing repositories directly.
 */
export const leaseService = new LeaseService(leaseRepository, journalEntryService, accountMappingService);
export const leaseAmortizationService = new LeaseAmortizationService(leaseAmortizationEntryRepository, leaseRepository, journalEntryService, accountMappingService);
export const leaseDisposalService = new LeaseDisposalService(leaseRepository, journalEntryService, accountMappingService);
