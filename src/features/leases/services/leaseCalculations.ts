import type { LeaseContract } from '@/types/lease';

/** Half a cent — same rounding tolerance as journalEntryService.ts. */
export const EPSILON = 0.005;

/** Rounds to 2 decimal places — every currency figure this module produces goes through this. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Present value of a fixed monthly-payment ordinary annuity, discounted at
 * `discountRatePercent` (an ANNUAL rate, e.g. 10 for 10%) compounded
 * monthly — the SA_ACCOUNTING_MASTER_SPEC.md §47/IFRS 16 measurement basis
 * for both `LeaseContract.initialLeaseLiability` and
 * `initialRightOfUseAsset` (no initial direct costs/lease incentives
 * modeled, so the two are always equal — see the type-level doc comment
 * on LeaseContract). A 0% discount rate is a legitimate input (an
 * interest-free lease) and is handled without dividing by zero: PV is
 * simply the sum of the undiscounted payments.
 */
export function calculateLeaseLiabilityPresentValue(
  monthlyPayment: number,
  leaseTermMonths: number,
  discountRatePercent: number,
): number {
  const monthlyRate = discountRatePercent / 100 / 12;
  if (monthlyRate === 0) {
    return round2(monthlyPayment * leaseTermMonths);
  }
  const pv = (monthlyPayment * (1 - Math.pow(1 + monthlyRate, -leaseTermMonths))) / monthlyRate;
  return round2(pv);
}

export interface MonthlyAmortizationResult {
  interest: number;
  principal: number;
  closingBalance: number;
}

/**
 * One month's amortization step for a lease liability under the
 * effective-interest method: interest accrues on the opening balance at
 * the monthly rate, and the remainder of the fixed payment reduces
 * principal. `monthlyRatePercent` is already a MONTHLY rate expressed as
 * a percent (e.g. an annual 10% discount rate becomes 10/12 ≈ 0.8333 here)
 * — callers divide the annual `discountRatePercent` by 12 before calling
 * this, mirroring calculateLeaseLiabilityPresentValue()'s own
 * annual-to-monthly conversion so the two never disagree.
 *
 * Principal is capped so it can never exceed the opening balance (the
 * final payment of the term, or a manual overpayment scenario, must not
 * drive the liability negative) — same "cap, never overshoot" pattern as
 * depreciationService.calculateMonthlyDepreciation()'s depreciable-base cap.
 */
export function calculateMonthlyAmortization(
  openingBalance: number,
  monthlyPayment: number,
  monthlyRatePercent: number,
): MonthlyAmortizationResult {
  if (openingBalance <= EPSILON) {
    return { interest: 0, principal: 0, closingBalance: 0 };
  }
  const monthlyRate = monthlyRatePercent / 100;
  const interest = round2(openingBalance * monthlyRate);
  let principal = round2(monthlyPayment - interest);
  if (principal < 0) principal = 0;
  if (principal > openingBalance) principal = round2(openingBalance);
  const closingBalance = round2(Math.max(0, openingBalance - principal));
  return { interest, principal, closingBalance };
}

/**
 * Fixed monthly straight-line depreciation charge for the Right-of-Use
 * asset over the full lease term — §47/IFRS 16 requires ROU assets to be
 * depreciated over the shorter of the lease term or the asset's useful
 * life; this codebase does not model a separate useful-life estimate for
 * the underlying asset, so the lease term itself is always used (a
 * documented simplification, not an oversight).
 */
export function calculateStraightLineRouDepreciation(initialRightOfUseAsset: number, leaseTermMonths: number): number {
  if (leaseTermMonths <= 0) return 0;
  return round2(initialRightOfUseAsset / leaseTermMonths);
}

/**
 * The portion of `outstandingLeaseLiability` that will be repaid within
 * the next 12 months — SA_ACCOUNTING_MASTER_SPEC.md §32's
 * "current/non-current classification" requirement. Computed by actually
 * simulating the amortization schedule forward (never a guess or a flat
 * fraction), capped at `monthsRemainingInTerm` for a lease nearing its
 * end. Shown as a computed/informational figure only — this Chart of
 * Accounts does not split any liability across two GL accounts for
 * current/non-current, so nothing is posted for this.
 */
export function calculateCurrentPortionOfLiability(
  outstandingLeaseLiability: number,
  monthlyPayment: number,
  discountRatePercent: number,
  monthsRemainingInTerm: number,
): number {
  if (outstandingLeaseLiability <= EPSILON || monthsRemainingInTerm <= 0) return 0;

  const monthlyRatePercent = discountRatePercent / 12;
  const horizon = Math.min(12, monthsRemainingInTerm);

  let balance = outstandingLeaseLiability;
  let principalDueWithin12Months = 0;
  for (let i = 0; i < horizon; i++) {
    if (balance <= EPSILON) break;
    const { principal, closingBalance } = calculateMonthlyAmortization(balance, monthlyPayment, monthlyRatePercent);
    principalDueWithin12Months += principal;
    balance = closingBalance;
  }
  return round2(principalDueWithin12Months);
}

/**
 * Convenience wrapper around calculateCurrentPortionOfLiability() for a
 * real LeaseContract plus however many amortization runs have already
 * completed for it (i.e. `LeaseAmortizationEntry` rows for this lease) —
 * the UI (LeaseRegisterPage) uses this rather than re-deriving
 * monthsRemainingInTerm inline, keeping the "how many months are left"
 * arithmetic in one tested place.
 */
export function calculateCurrentPortionForLease(
  lease: Pick<LeaseContract, 'outstandingLeaseLiability' | 'monthlyPayment' | 'discountRatePercent' | 'leaseTermMonths'>,
  completedAmortizationRuns: number,
): number {
  const monthsRemaining = Math.max(0, lease.leaseTermMonths - completedAmortizationRuns);
  return calculateCurrentPortionOfLiability(
    lease.outstandingLeaseLiability,
    lease.monthlyPayment,
    lease.discountRatePercent,
    monthsRemaining,
  );
}
