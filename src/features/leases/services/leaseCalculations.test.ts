import { describe, it, expect } from 'vitest';
import {
  calculateCurrentPortionForLease,
  calculateCurrentPortionOfLiability,
  calculateLeaseLiabilityPresentValue,
  calculateMonthlyAmortization,
  calculateStraightLineRouDepreciation,
  projectLeasePaymentSchedule,
} from './leaseCalculations';
import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';

describe('calculateLeaseLiabilityPresentValue', () => {
  it('matches a hand-computed PV example (monthly payment 10000, 36 months, 10% annual)', () => {
    // monthlyRate = 10 / 100 / 12 = 0.0083333...
    // PV = 10000 * (1 - (1.0083333...)^-36) / 0.0083333...
    const monthlyRate = 10 / 100 / 12;
    const expected = (10000 * (1 - Math.pow(1 + monthlyRate, -36))) / monthlyRate;
    const result = calculateLeaseLiabilityPresentValue(10000, 36, 10);
    expect(result).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    // Sanity: PV must be less than the sum of undiscounted payments (positive rate).
    expect(result).toBeLessThan(10000 * 36);
    expect(result).toBeGreaterThan(0);
  });

  it('a 0% discount rate returns the simple sum of payments (no division by zero)', () => {
    expect(calculateLeaseLiabilityPresentValue(5000, 24, 0)).toBe(5000 * 24);
  });

  it('a single-month lease at any rate collapses to roughly the one payment discounted one month', () => {
    const result = calculateLeaseLiabilityPresentValue(1000, 1, 12);
    const monthlyRate = 12 / 100 / 12; // 0.01
    expect(result).toBeCloseTo(1000 / (1 + monthlyRate), 2);
  });
});

describe('calculateMonthlyAmortization', () => {
  it('interest + principal === payment every period (until the final capped payment)', () => {
    const monthlyPayment = 1000;
    const monthlyRatePercent = 10 / 12; // 10% annual
    let balance = calculateLeaseLiabilityPresentValue(monthlyPayment, 12, 10);

    for (let month = 1; month <= 12; month++) {
      const { interest, principal, closingBalance } = calculateMonthlyAmortization(balance, monthlyPayment, monthlyRatePercent);
      if (month < 12) {
        // Not the final payment: interest + principal should equal the full payment.
        expect(interest + principal).toBeCloseTo(monthlyPayment, 2);
      }
      expect(closingBalance).toBeCloseTo(balance - principal, 2);
      balance = closingBalance;
    }

    // The schedule's final closing balance rounds to ~0 at lease end.
    expect(balance).toBeCloseTo(0, 1);
  });

  it('caps principal so it never drives the closing balance negative on the final payment', () => {
    const { interest, principal, closingBalance } = calculateMonthlyAmortization(50, 1000, 10 / 12);
    expect(principal).toBeCloseTo(50, 2);
    expect(closingBalance).toBe(0);
    expect(interest + principal).toBeLessThanOrEqual(1000);
  });

  it('returns all zeros once the opening balance is already ~0', () => {
    const result = calculateMonthlyAmortization(0, 1000, 10 / 12);
    expect(result).toEqual({ interest: 0, principal: 0, closingBalance: 0 });
  });

  it('a 0% rate charges no interest — the whole payment is principal', () => {
    const { interest, principal } = calculateMonthlyAmortization(1000, 100, 0);
    expect(interest).toBe(0);
    expect(principal).toBe(100);
  });
});

describe('calculateStraightLineRouDepreciation', () => {
  it('spreads the initial ROU asset evenly over the lease term', () => {
    expect(calculateStraightLineRouDepreciation(36000, 36)).toBe(1000);
  });

  it('returns 0 for a non-positive term', () => {
    expect(calculateStraightLineRouDepreciation(36000, 0)).toBe(0);
  });
});

describe('calculateCurrentPortionOfLiability', () => {
  it('simulates the schedule forward 12 months and sums the principal repaid', () => {
    const monthlyPayment = 1000;
    const discountRatePercent = 10;
    const outstanding = calculateLeaseLiabilityPresentValue(monthlyPayment, 36, discountRatePercent);

    const currentPortion = calculateCurrentPortionOfLiability(outstanding, monthlyPayment, discountRatePercent, 36);

    // Manually walk the same 12 months and compare.
    let balance = outstanding;
    let expectedPrincipal = 0;
    for (let i = 0; i < 12; i++) {
      const { principal, closingBalance } = calculateMonthlyAmortization(balance, monthlyPayment, discountRatePercent / 12);
      expectedPrincipal += principal;
      balance = closingBalance;
    }
    expect(currentPortion).toBeCloseTo(Math.round(expectedPrincipal * 100) / 100, 2);
    // Current portion must never exceed the full outstanding liability.
    expect(currentPortion).toBeLessThanOrEqual(outstanding);
  });

  it('caps the simulation horizon when fewer than 12 months remain in the term', () => {
    const monthlyPayment = 1000;
    const discountRatePercent = 10;
    const outstanding = calculateLeaseLiabilityPresentValue(monthlyPayment, 3, discountRatePercent);

    // Only 3 months left -> the ENTIRE outstanding balance is "current".
    const currentPortion = calculateCurrentPortionOfLiability(outstanding, monthlyPayment, discountRatePercent, 3);
    expect(currentPortion).toBeCloseTo(outstanding, 2);
  });

  it('returns 0 once the liability is already extinguished', () => {
    expect(calculateCurrentPortionOfLiability(0, 1000, 10, 12)).toBe(0);
  });
});

describe('calculateCurrentPortionForLease', () => {
  it('derives monthsRemainingInTerm from leaseTermMonths minus completed runs', () => {
    const lease = {
      outstandingLeaseLiability: 10000,
      monthlyPayment: 1000,
      discountRatePercent: 10,
      leaseTermMonths: 12,
    };
    // 10 months already run -> only 2 months left, so the current portion caps at that horizon.
    const withFewMonthsLeft = calculateCurrentPortionForLease(lease, 10);
    const direct = calculateCurrentPortionOfLiability(10000, 1000, 10, 2);
    expect(withFewMonthsLeft).toBeCloseTo(direct, 2);
  });

  it('never lets monthsRemaining go negative when more runs have completed than the term', () => {
    const lease = { outstandingLeaseLiability: 100, monthlyPayment: 1000, discountRatePercent: 10, leaseTermMonths: 12 };
    expect(calculateCurrentPortionForLease(lease, 20)).toBe(0);
  });
});

describe('projectLeasePaymentSchedule (FINAL HARDENING PART B — period-traceable lease clearing)', () => {
  function makeLease(overrides: Partial<LeaseContract> = {}): Pick<LeaseContract, 'commencementDate' | 'leaseTermMonths' | 'monthlyPayment' | 'discountRatePercent' | 'initialLeaseLiability' | 'initialRightOfUseAsset' | 'status'> {
    return {
      commencementDate: '2026-01-01',
      leaseTermMonths: 12,
      monthlyPayment: 1000,
      discountRatePercent: 12,
      initialLeaseLiability: calculateLeaseLiabilityPresentValue(1000, 12, 12),
      initialRightOfUseAsset: calculateLeaseLiabilityPresentValue(1000, 12, 12),
      status: 'active',
      ...overrides,
    };
  }

  function makeEntry(overrides: Partial<LeaseAmortizationEntry>): LeaseAmortizationEntry {
    return {
      id: 'entry_1',
      leaseId: 'lease_1',
      periodEnd: '2026-01-31',
      interestAmount: 100,
      principalAmount: 800,
      depreciationAmount: 900,
      outstandingLeaseLiabilityAfter: 10000,
      accumulatedDepreciationAfter: 900,
      journalEntryId: 'je_1',
      createdAt: '',
      updatedAt: '',
      ...overrides,
    };
  }

  it('with no history, projects the FULL term (leaseTermMonths rows), all marked posted: false', () => {
    const lease = makeLease({ leaseTermMonths: 12 });
    const schedule = projectLeasePaymentSchedule(lease, []);
    expect(schedule).toHaveLength(12);
    expect(schedule.every((r) => !r.posted)).toBe(true);
    expect(schedule[0].periodNumber).toBe(1);
    expect(schedule[11].periodNumber).toBe(12);
  });

  it('posted periods use the REAL entry figures verbatim, never recomputed', () => {
    const lease = makeLease();
    const entry = makeEntry({ interestAmount: 123.45, principalAmount: 876.55, outstandingLeaseLiabilityAfter: 9123.0, journalEntryId: 'je_real' });
    const schedule = projectLeasePaymentSchedule(lease, [entry]);
    const row = schedule[0];
    expect(row.posted).toBe(true);
    expect(row.entryId).toBe('entry_1');
    expect(row.journalEntryId).toBe('je_real');
    expect(row.interest).toBe(123.45);
    expect(row.principal).toBe(876.55);
    expect(row.payment).toBeCloseTo(1000, 2);
    expect(row.closingLiability).toBe(9123.0);
  });

  it('projected periods continue from the LAST posted period\'s closing balance, not from the original opening balance', () => {
    const lease = makeLease({ leaseTermMonths: 12 });
    const janEntry = makeEntry({ id: 'entry_jan', periodEnd: '2026-01-31', outstandingLeaseLiabilityAfter: 9200, accumulatedDepreciationAfter: 900 });
    const schedule = projectLeasePaymentSchedule(lease, [janEntry]);
    // Capped at the term (12) but may finish sooner — R9,200 at R1,000/month
    // amortizes fully in well under 11 more periods, so fewer than 12 rows
    // total is the CORRECT behaviour here, not a bug.
    expect(schedule.length).toBeGreaterThan(1);
    expect(schedule.length).toBeLessThanOrEqual(12);
    expect(schedule[0].posted).toBe(true);
    expect(schedule[1].posted).toBe(false);
    // February's opening liability must equal January's closing, not the lease's original PV.
    expect(schedule[1].openingLiability).toBeCloseTo(9200, 2);
    expect(schedule[1].periodEnd).toBe('2026-02-28');
  });

  it('stops projecting once the liability is fully amortized, even before leaseTermMonths is reached', () => {
    const lease = makeLease({ leaseTermMonths: 60, monthlyPayment: 100000, discountRatePercent: 0, initialLeaseLiability: 100000 });
    const schedule = projectLeasePaymentSchedule(lease, []);
    // A R100,000 liability paid off at R100,000/month with 0% interest clears in ONE period.
    expect(schedule).toHaveLength(1);
    expect(schedule[0].closingLiability).toBe(0);
  });

  it('a terminated lease shows ONLY its posted history — nothing is projected past termination', () => {
    const lease = makeLease({ leaseTermMonths: 36, status: 'terminated' });
    const entry = makeEntry({});
    const schedule = projectLeasePaymentSchedule(lease, [entry]);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].posted).toBe(true);
  });

  it('posts nothing and mutates nothing — pure projection, safe to call repeatedly', () => {
    const lease = makeLease();
    const before = projectLeasePaymentSchedule(lease, []);
    const after = projectLeasePaymentSchedule(lease, []);
    expect(after).toEqual(before);
  });
});
