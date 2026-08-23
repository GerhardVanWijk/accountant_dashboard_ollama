import type { ID } from '@/types/common';
import type { JournalEntry } from '@/types';
import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';
import type { ILeaseAmortizationEntryRepository } from '../repositories/ILeaseAmortizationEntryRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import { EPSILON, calculateMonthlyAmortization, calculateStraightLineRouDepreciation, round2 } from './leaseCalculations';

/**
 * Note Right-of-Use Assets (the ROU asset's own cost account) is
 * deliberately absent here — a periodic amortization run only ever moves
 * its accumulated-depreciation contra account and the depreciation
 * expense; the cost account itself is untouched until
 * leaseDisposalService.terminateLease() derecognizes it.
 */

export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

/** Minimal surface of LeaseRepository this service depends on. */
export interface LeaseStore {
  getAll(): Promise<LeaseContract[]>;
  update(id: ID, patch: Partial<LeaseContract>): Promise<LeaseContract>;
}

export interface LeaseAmortizationRunResult {
  entries: LeaseAmortizationEntry[];
  /** Undefined when no lease was eligible for this period — nothing was posted. */
  journalEntryId?: ID;
}

interface EligibleLeaseMovement {
  lease: LeaseContract;
  interest: number;
  principal: number;
  depreciation: number;
  outstandingLeaseLiabilityAfter: number;
  accumulatedDepreciationAfter: number;
}

/**
 * The lease amortization engine (SA_ACCOUNTING_MASTER_SPEC.md §32,
 * §47/IFRS 16). runAmortization() posts ONE combined journal entry per run
 * covering every eligible active lease — interest unwind + principal
 * repayment on the liability, plus straight-line ROU depreciation —
 * aggregated across every lease into net per-account movements (the same
 * "debits and credits as vectors" technique deferredTaxComputationService
 * uses), rather than one entry per lease, keeping the ledger readable.
 * Mirrors depreciationService.runDepreciation()'s shape closely: same
 * per-period idempotency guard, same "nothing due" empty-result
 * convention, same GL-then-mutate ordering.
 */
export class LeaseAmortizationService {
  constructor(
    private readonly amortizationRepository: ILeaseAmortizationEntryRepository,
    private readonly leaseStore: LeaseStore,
    private readonly journalPoster: JournalPoster,
    private readonly accounts: AccountMapper,
  ) {}

  async getAmortizationHistory(leaseId?: ID): Promise<LeaseAmortizationEntry[]> {
    if (leaseId) {
      return this.amortizationRepository.getByLease(leaseId);
    }
    return this.amortizationRepository.getAll();
  }

  /**
   * Runs amortization for every 'active' lease not already amortized for
   * this exact `periodEnd` (idempotency guard — same class as
   * depreciationService.runDepreciation()'s already-run guard) and with a
   * positive `outstandingLeaseLiability`. A "nothing due" outcome (empty
   * `entries`, no `journalEntryId`) is a normal result of running
   * amortization twice in the same period, or after every lease has fully
   * amortized — not a failure.
   */
  async runAmortization(periodEnd: string, postedByUserId?: ID): Promise<LeaseAmortizationRunResult> {
    const leases = await this.leaseStore.getAll();
    const eligible: EligibleLeaseMovement[] = [];

    for (const lease of leases) {
      if (lease.status !== 'active') continue;
      if (lease.outstandingLeaseLiability <= EPSILON) continue;

      const history = await this.amortizationRepository.getByLease(lease.id);
      if (history.some((entry) => entry.periodEnd === periodEnd)) continue;

      const monthlyRatePercent = lease.discountRatePercent / 12;
      const { interest, principal, closingBalance } = calculateMonthlyAmortization(
        lease.outstandingLeaseLiability,
        lease.monthlyPayment,
        monthlyRatePercent,
      );

      const fullMonthlyDepreciation = calculateStraightLineRouDepreciation(lease.initialRightOfUseAsset, lease.leaseTermMonths);
      const depreciationRemaining = Math.max(0, round2(lease.initialRightOfUseAsset - lease.accumulatedDepreciation));
      const depreciation = Math.min(fullMonthlyDepreciation, depreciationRemaining);

      if (interest <= EPSILON && principal <= EPSILON && depreciation <= EPSILON) continue;

      eligible.push({
        lease,
        interest,
        principal,
        depreciation,
        outstandingLeaseLiabilityAfter: closingBalance,
        accumulatedDepreciationAfter: round2(lease.accumulatedDepreciation + depreciation),
      });
    }

    if (eligible.length === 0) {
      return { entries: [] };
    }

    let totalInterest = 0;
    let totalPrincipal = 0;
    let totalDepreciation = 0;
    for (const item of eligible) {
      totalInterest = round2(totalInterest + item.interest);
      totalPrincipal = round2(totalPrincipal + item.principal);
      totalDepreciation = round2(totalDepreciation + item.depreciation);
    }
    const totalPayment = round2(totalInterest + totalPrincipal);

    /**
     * Debit-vector map (docs/LEDGER_ARCHITECTURE.md "debits and credits as
     * vectors" — positive = net debit, negative = net credit):
     *   Interest Expense - Lease Liabilities (5810, debit-normal expense):
     *     interest incurred this period is a debit -> +totalInterest
     *   Lease Liability (2450, credit-normal liability): repaying
     *     principal is a DEBIT that reduces a credit-normal balance ->
     *     +totalPrincipal
     *   Cash and Bank (1000, debit-normal asset): the lease payment going
     *     out is a credit -> -totalPayment
     *   Depreciation Expense - ROU (5800, debit-normal expense): the
     *     charge is a debit -> +totalDepreciation
     *   Accumulated Depreciation - ROU (1790, credit-normal contra-asset):
     *     the charge increases it, a credit -> -totalDepreciation
     *
     * Sum check (must be exactly zero for the entry to balance):
     *   totalInterest + totalPrincipal - totalPayment + totalDepreciation - totalDepreciation
     *   = totalInterest + totalPrincipal - (totalInterest + totalPrincipal) + 0
     *   = 0.
     */
    const vectors = new Map<ID, number>();
    const addVector = (accountId: ID, amount: number) => {
      if (Math.abs(amount) <= EPSILON) return;
      vectors.set(accountId, round2((vectors.get(accountId) ?? 0) + amount));
    };

    const [interestExpenseLeaseId, leaseLiabilityId, cashAndBankId, depreciationExpenseRouId, accumulatedDepreciationRouId] =
      await Promise.all([
        this.accounts.getAccountId('INTEREST_EXPENSE_LEASE'),
        this.accounts.getAccountId('LEASE_LIABILITY'),
        this.accounts.getAccountId('CASH_AND_BANK'),
        this.accounts.getAccountId('DEPRECIATION_EXPENSE_ROU'),
        this.accounts.getAccountId('ACCUMULATED_DEPRECIATION_ROU'),
      ]);
    addVector(interestExpenseLeaseId, totalInterest);
    addVector(leaseLiabilityId, totalPrincipal);
    addVector(cashAndBankId, -totalPayment);
    addVector(depreciationExpenseRouId, totalDepreciation);
    addVector(accumulatedDepreciationRouId, -totalDepreciation);

    if (vectors.size === 0) {
      return { entries: [] };
    }

    const memo = `Lease amortization run for period ending ${periodEnd}`;
    const lines: NewJournalLineInput[] = [...vectors].map(([accountId, vector]) => ({
      accountId,
      description: memo,
      debit: vector > 0 ? round2(vector) : 0,
      credit: vector < 0 ? round2(-vector) : 0,
    }));

    const journalEntry = await this.journalPoster.postJournalEntry({
      date: periodEnd,
      source: 'lease_amortization',
      memo,
      lines,
      postedByUserId,
    });

    const entries: LeaseAmortizationEntry[] = [];
    for (const item of eligible) {
      await this.leaseStore.update(item.lease.id, {
        outstandingLeaseLiability: item.outstandingLeaseLiabilityAfter,
        accumulatedDepreciation: item.accumulatedDepreciationAfter,
      });

      const entry = await this.amortizationRepository.create({
        id: '',
        leaseId: item.lease.id,
        periodEnd,
        interestAmount: item.interest,
        principalAmount: item.principal,
        depreciationAmount: item.depreciation,
        outstandingLeaseLiabilityAfter: item.outstandingLeaseLiabilityAfter,
        accumulatedDepreciationAfter: item.accumulatedDepreciationAfter,
        journalEntryId: journalEntry.id,
        createdAt: '',
        updatedAt: '',
      });
      entries.push(entry);
    }

    return { entries, journalEntryId: journalEntry.id };
  }
}
