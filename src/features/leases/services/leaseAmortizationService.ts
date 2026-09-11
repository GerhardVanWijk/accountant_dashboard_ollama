import type { ID } from '@/types/common';
import type { LeaseAmortizationEntry, LeaseContract } from '@/types/lease';
import type { ILeaseAmortizationEntryRepository } from '../repositories/ILeaseAmortizationEntryRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import { EPSILON, calculateMonthlyAmortization, calculateStraightLineRouDepreciation, round2 } from './leaseCalculations';
import type { LeaseAmortizationPeriodExecutor, LeaseAmortizationPeriodLineInput } from './leaseAmortizationPeriodExecutor';
import type { LeasePeriodSettlementExecutor, SettleLeasePeriodPaymentResult } from './leasePeriodSettlementExecutor';
import { newUuid } from '@/lib/uuid';

/**
 * Note Right-of-Use Assets (the ROU asset's own cost account) is
 * deliberately absent here — a periodic amortization run only ever moves
 * its accumulated-depreciation contra account and the depreciation
 * expense; the cost account itself is untouched until
 * leaseDisposalService.terminateLease() derecognizes it.
 */

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

/** One lease's row in a pre-posting preview (PART 1.20 of the Leases + Payroll integrity audit) — covers every active lease, not just the eligible ones, so a blocked lease and its reason are visible before the user confirms. */
export interface LeaseAmortizationPreviewRow {
  lease: LeaseContract;
  openingLiability: number;
  payment: number;
  interest: number;
  principal: number;
  closingLiability: number;
  rouDepreciation: number;
  status: 'ready' | 'blocked';
  reason?: string;
}

/**
 * Computes, WITHOUT posting anything, exactly what runAmortization() would
 * do for `periodEnd` — same eligibility rule, same math
 * (calculateMonthlyAmortization/calculateStraightLineRouDepreciation), same
 * per-lease-per-period idempotency check against already-posted history.
 * runAmortization() itself calls this so the preview a user reviews can
 * never drift from what actually gets posted (PART 1.20's "PREVIEW before
 * posting" requirement). Covers every non-terminated lease, including
 * drafts and already-amortized/exhausted ones, each tagged 'ready' or
 * 'blocked' with a human reason — not just the eligible subset.
 */
export function computeLeaseAmortizationPreview(
  leases: LeaseContract[],
  historyByLeaseId: Map<ID, LeaseAmortizationEntry[]>,
  periodEnd: string,
): LeaseAmortizationPreviewRow[] {
  const rows: LeaseAmortizationPreviewRow[] = [];

  for (const lease of leases) {
    if (lease.status === 'draft') {
      rows.push({
        lease, openingLiability: 0, payment: lease.monthlyPayment, interest: 0, principal: 0,
        closingLiability: 0, rouDepreciation: 0, status: 'blocked', reason: 'Not yet commenced (still a draft).',
      });
      continue;
    }
    if (lease.status === 'terminated') {
      rows.push({
        lease, openingLiability: 0, payment: lease.monthlyPayment, interest: 0, principal: 0,
        closingLiability: 0, rouDepreciation: 0, status: 'blocked', reason: 'Terminated — no further amortization.',
      });
      continue;
    }
    if (lease.outstandingLeaseLiability <= EPSILON) {
      rows.push({
        lease, openingLiability: lease.outstandingLeaseLiability, payment: lease.monthlyPayment, interest: 0, principal: 0,
        closingLiability: lease.outstandingLeaseLiability, rouDepreciation: 0, status: 'blocked', reason: 'Fully amortized — liability already extinguished.',
      });
      continue;
    }

    const history = historyByLeaseId.get(lease.id) ?? [];
    if (history.some((entry) => entry.periodEnd === periodEnd)) {
      rows.push({
        lease, openingLiability: lease.outstandingLeaseLiability, payment: lease.monthlyPayment, interest: 0, principal: 0,
        closingLiability: lease.outstandingLeaseLiability, rouDepreciation: 0, status: 'blocked', reason: `Already amortized for ${periodEnd}.`,
      });
      continue;
    }

    const monthlyRatePercent = lease.discountRatePercent / 12;
    const { interest, principal, closingBalance } = calculateMonthlyAmortization(
      lease.outstandingLeaseLiability,
      lease.monthlyPayment,
      monthlyRatePercent,
    );

    const fullMonthlyDepreciation = calculateStraightLineRouDepreciation(lease.initialRightOfUseAsset, lease.leaseTermMonths);
    const depreciationRemaining = Math.max(0, round2(lease.initialRightOfUseAsset - lease.accumulatedDepreciation));
    const depreciation = Math.min(fullMonthlyDepreciation, depreciationRemaining);

    if (interest <= EPSILON && principal <= EPSILON && depreciation <= EPSILON) {
      rows.push({
        lease, openingLiability: lease.outstandingLeaseLiability, payment: lease.monthlyPayment, interest: 0, principal: 0,
        closingLiability: lease.outstandingLeaseLiability, rouDepreciation: 0, status: 'blocked', reason: 'Nothing due this period.',
      });
      continue;
    }

    rows.push({
      lease,
      openingLiability: lease.outstandingLeaseLiability,
      payment: round2(interest + principal),
      interest,
      principal,
      closingLiability: closingBalance,
      rouDepreciation: depreciation,
      status: 'ready',
    });
  }

  return rows;
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
 * convention. Posts through `periodExecutor` — one atomic RPC call
 * (`post_lease_amortization_period`, migration 0089) that posts the
 * combined journal AND every lease's entry + running-balance snapshot in
 * the SAME database transaction (Leases + Payroll integrity audit, PART
 * 1) — a failure partway through leaves NOTHING committed for that
 * period. The cash leg credits `LEASE_PAYMENT_CLEARING` (2460), never
 * `CASH_AND_BANK` directly (PART 3's Banking fix, enforced again
 * server-side by the RPC) — the real debit order is recorded once, later,
 * through Banking against this same clearing account.
 */
export class LeaseAmortizationService {
  constructor(
    private readonly amortizationRepository: ILeaseAmortizationEntryRepository,
    private readonly leaseStore: LeaseStore,
    private readonly periodExecutor: LeaseAmortizationPeriodExecutor,
    private readonly accounts: AccountMapper,
    private readonly settlementExecutor: LeasePeriodSettlementExecutor,
  ) {}

  async getAmortizationHistory(leaseId?: ID): Promise<LeaseAmortizationEntry[]> {
    if (leaseId) {
      return this.amortizationRepository.getByLease(leaseId);
    }
    return this.amortizationRepository.getAll();
  }

  private async historyByLeaseId(leases: LeaseContract[]): Promise<Map<ID, LeaseAmortizationEntry[]>> {
    const map = new Map<ID, LeaseAmortizationEntry[]>();
    for (const lease of leases) {
      map.set(lease.id, await this.amortizationRepository.getByLease(lease.id));
    }
    return map;
  }

  /**
   * Read-only "what would runAmortization(periodEnd) do right now" —
   * PART 1.20's PREVIEW-before-posting requirement. Calls the exact same
   * computeLeaseAmortizationPreview() runAmortization() uses internally, so
   * the numbers a user reviews here can never drift from what actually gets
   * posted when they confirm. Posts nothing, mutates nothing.
   */
  async previewAmortization(periodEnd: string): Promise<LeaseAmortizationPreviewRow[]> {
    const leases = await this.leaseStore.getAll();
    const history = await this.historyByLeaseId(leases);
    return computeLeaseAmortizationPreview(leases, history, periodEnd);
  }

  /**
   * Runs amortization for every 'active' lease not already amortized for
   * this exact `periodEnd` (idempotency guard — same class as
   * depreciationService.runDepreciation()'s already-run guard) and with a
   * positive `outstandingLeaseLiability`. A "nothing due" outcome (empty
   * `entries`, no `journalEntryId`) is a normal result of running
   * amortization twice in the same period, or after every lease has fully
   * amortized — not a failure. Eligibility/math is computed by
   * computeLeaseAmortizationPreview() — the identical function
   * previewAmortization() calls — so what gets posted here always matches
   * what a caller previewed first.
   */
  async runAmortization(periodEnd: string, postedByUserId?: ID): Promise<LeaseAmortizationRunResult> {
    const leases = await this.leaseStore.getAll();
    const history = await this.historyByLeaseId(leases);
    const preview = computeLeaseAmortizationPreview(leases, history, periodEnd);
    const eligible: EligibleLeaseMovement[] = [];

    for (const row of preview) {
      if (row.status !== 'ready') continue;

      eligible.push({
        lease: row.lease,
        interest: row.interest,
        principal: row.principal,
        depreciation: row.rouDepreciation,
        outstandingLeaseLiabilityAfter: row.closingLiability,
        accumulatedDepreciationAfter: round2(row.lease.accumulatedDepreciation + row.rouDepreciation),
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

    const [interestExpenseLeaseId, leaseLiabilityId, leasePaymentClearingId, depreciationExpenseRouId, accumulatedDepreciationRouId] =
      await Promise.all([
        this.accounts.getAccountId('INTEREST_EXPENSE_LEASE'),
        this.accounts.getAccountId('LEASE_LIABILITY'),
        // PART 3 Banking fix: the payment leg clears to the 2460 Lease
        // Payment Clearing liability, never Cash and Bank directly — the
        // real debit order is recorded once, later, through Banking
        // against this same account (see migration 0089's header).
        this.accounts.getAccountId('LEASE_PAYMENT_CLEARING'),
        this.accounts.getAccountId('DEPRECIATION_EXPENSE_ROU'),
        this.accounts.getAccountId('ACCUMULATED_DEPRECIATION_ROU'),
      ]);
    addVector(interestExpenseLeaseId, totalInterest);
    addVector(leaseLiabilityId, totalPrincipal);
    addVector(leasePaymentClearingId, -totalPayment);
    addVector(depreciationExpenseRouId, totalDepreciation);
    addVector(accumulatedDepreciationRouId, -totalDepreciation);

    if (vectors.size === 0) {
      return { entries: [] };
    }

    const memo = `Lease amortization run for period ending ${periodEnd}`;
    const journalLines: NewJournalLineInput[] = [...vectors].map(([accountId, vector]) => ({
      accountId,
      description: memo,
      debit: vector > 0 ? round2(vector) : 0,
      credit: vector < 0 ? round2(-vector) : 0,
    }));

    const periodLines: LeaseAmortizationPeriodLineInput[] = eligible.map((item) => ({
      leaseId: item.lease.id,
      interest: item.interest,
      principal: item.principal,
      depreciation: item.depreciation,
      outstandingLeaseLiabilityAfter: item.outstandingLeaseLiabilityAfter,
      accumulatedDepreciationAfter: item.accumulatedDepreciationAfter,
    }));

    const result = await this.periodExecutor.postPeriod({
      runId: newUuid(),
      periodEnd,
      memo,
      source: 'lease_amortization',
      lines: periodLines,
      journalLines,
      leasePaymentClearingAccountId: leasePaymentClearingId,
      createdBy: postedByUserId,
    });

    return { entries: result.entries, journalEntryId: result.journalEntryId };
  }

  /**
   * Records the real cash movement that clears (part of) ONE amortization
   * period's Lease Payment Clearing obligation — FINAL PRE-MIGRATION
   * HARDENING, PARTS A + B. Posts through `settlementExecutor` — one
   * atomic RPC call (`settle_lease_period_payment`, migration 0097) that
   * derives the authoritative outstanding balance for THIS SPECIFIC
   * `LeaseAmortizationEntry` (not the lease cumulatively) from its own
   * posted `interest_amount + principal_amount` and every settlement
   * already recorded against it, and refuses an amount that would exceed
   * it, entirely at the database layer under a row lock scoped to that one
   * period — settling January never contends with, and can never bleed
   * into, February's obligation.
   */
  async settlePeriod(
    leaseAmortizationEntryId: ID,
    input: { bankAccountId: ID; date: string; amount: number; description?: string; reference?: string; settledByUserId?: ID },
  ): Promise<SettleLeasePeriodPaymentResult> {
    return this.settlementExecutor.settle({
      settlementId: newUuid(),
      leaseAmortizationEntryId,
      bankAccountId: input.bankAccountId,
      date: input.date,
      description: input.description,
      reference: input.reference,
      amount: input.amount,
      createdBy: input.settledByUserId,
    });
  }
}
