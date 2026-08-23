import type { Company, EclBucketLine, EclComputation, FinancialYear, ID, JournalEntry } from '@/types';
import type { AgingReportRow } from '@/features/reports/aging/types';
import type { IEclComputationRepository } from '../repositories/IEclComputationRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import {
  aggregateReceivablesByBucket,
  calculateEclTotals,
  EPSILON,
  buildEclBucketLines,
  findMostRecentPostedEclBefore,
  recalculateBucketLine,
  round2,
} from './eclCalculations';

/** Fixed GL account ids (src/mock-data/accounts.ts), added for Phase 12. */
export interface JournalPoster {
  postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[]; postedByUserId?: ID }): Promise<JournalEntry>;
}

/** Narrow surface each dependency needs — same "narrow interface, real singleton injected in services/index.ts" pattern every other module in this codebase uses. */
export interface FinancialYearLookup {
  getFinancialYears(): Promise<FinancialYear[]>;
}
export interface CompanyLookup {
  getCompanies(): Promise<Company[]>;
}
export interface AgingLookup {
  getCustomerAgingReport(asOf: Date): Promise<AgingReportRow[]>;
}

/**
 * Expected Credit Loss provisioning on trade receivables (SA_ACCOUNTING_MASTER_SPEC.md
 * §46/IFRS 9, §116 Phase 12 "Advanced Accounting") — the simplified provision-matrix
 * approach IFRS 9 explicitly permits for trade receivables with no significant
 * financing component. Draft-then-post lifecycle matching every other computation in
 * this codebase (TaxComputation/DeferredTaxComputation). Gross receivables per aging
 * bucket come from the real Customer Aging Report calculation (`getCustomerAgingReport()`
 * — never re-derived a second way); loss RATES per bucket are always a manual input
 * (§110 — no historical default-rate data exists in this codebase to derive them from),
 * defaulting to whatever rate the prior posted computation used for continuity, or 0%
 * for a company's first-ever computation.
 *
 * `postComputation()` posts only the MOVEMENT since the prior POSTED computation for
 * this company (the provision is a balance-sheet position that accumulates, the exact
 * same shape as DeferredTaxComputationService.postComputation()) — never the full
 * provision balance again.
 *
 * Deliberately does NOT model loans, investments, or any other financial asset/
 * liability — no such module exists anywhere else in this codebase, and §46's other
 * bullets (amortised cost, fair value) have nothing real to compute against yet.
 */
export class EclComputationService {
  constructor(
    private readonly repository: IEclComputationRepository,
    private readonly financialYearLookup: FinancialYearLookup,
    private readonly companyLookup: CompanyLookup,
    private readonly agingLookup: AgingLookup,
    private readonly journalPoster: JournalPoster,
    private readonly accounts: AccountMapper,
  ) {}

  async getComputations(): Promise<EclComputation[]> {
    return this.repository.getAll();
  }

  async getComputation(id: ID): Promise<EclComputation | undefined> {
    return this.repository.getById(id);
  }

  async getComputationForFinancialYear(financialYearId: ID): Promise<EclComputation | undefined> {
    return this.repository.getByFinancialYear(financialYearId);
  }

  private async resolveFinancialYear(financialYearId: ID): Promise<FinancialYear> {
    const years = await this.financialYearLookup.getFinancialYears();
    const year = years.find((y) => y.id === financialYearId);
    if (!year) {
      throw new Error(`Financial year "${financialYearId}" not found.`);
    }
    return year;
  }

  private async resolveCompany(): Promise<Company> {
    const companies = await this.companyLookup.getCompanies();
    const company = companies[0];
    if (!company) {
      throw new Error('No company record found — cannot compute expected credit losses without a company.');
    }
    return company;
  }

  /**
   * Computes real gross-receivable-per-bucket totals for a financial year
   * end WITHOUT persisting anything — exposed separately so the UI (or
   * createComputation() below) can preview before/while creating the draft.
   * Pulls loss rates forward from the company's most recent POSTED
   * computation, if any.
   */
  async prepareComputation(financialYearId: ID): Promise<EclBucketLine[]> {
    const financialYear = await this.resolveFinancialYear(financialYearId);
    const company = await this.resolveCompany();

    const [agingRows, allForCompany] = await Promise.all([
      this.agingLookup.getCustomerAgingReport(new Date(financialYear.endDate)),
      this.repository.getByCompany(company.id),
    ]);

    const grossByBucket = aggregateReceivablesByBucket(agingRows);
    const prior = findMostRecentPostedEclBefore(allForCompany, company.id, financialYear.endDate);
    return buildEclBucketLines(grossByBucket, prior?.buckets ?? []);
  }

  /**
   * Creates a new draft EclComputation as of the financial year's own end
   * date — the same reporting-date boundary DeferredTaxComputationService
   * uses. Idempotency guard: rejects a financial year that already has ANY
   * computation (draft or posted).
   */
  async createComputation(financialYearId: ID): Promise<EclComputation> {
    const existing = await this.repository.getByFinancialYear(financialYearId);
    if (existing) {
      throw new Error(
        `Financial year "${financialYearId}" already has a ${existing.status} expected credit loss computation ("${existing.id}"). Delete the draft first if you need to recompute.`,
      );
    }

    const financialYear = await this.resolveFinancialYear(financialYearId);
    const company = await this.resolveCompany();
    const buckets = await this.prepareComputation(financialYearId);
    const totals = calculateEclTotals(buckets);

    const now = new Date().toISOString();
    return this.repository.create({
      id: '',
      companyId: company.id,
      financialYearId,
      financialYearLabel: financialYear.name,
      asOfDate: financialYear.endDate,
      status: 'draft',
      buckets,
      ...totals,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Replaces a draft's bucket lines and recomputes each one's
   * expectedCreditLoss plus the totals through the SAME calculation
   * functions createComputation() used — never trust a caller-supplied
   * expectedCreditLoss, always re-derive it from grossReceivable/
   * lossRatePercent. grossReceivable itself stays whatever the caller
   * passes (an accountant may need to correct a figure), but is never
   * silently re-fetched here — recompute a fresh draft (delete + create) to
   * pull in newer posted-document data.
   */
  async updateBuckets(id: ID, buckets: EclBucketLine[]): Promise<EclComputation> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Expected credit loss computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Cannot edit expected credit loss computation for "${computation.financialYearLabel}": it has already been posted.`);
    }

    const recalculated = buckets.map(recalculateBucketLine);
    const totals = calculateEclTotals(recalculated);

    return this.repository.update(id, { buckets: recalculated, ...totals });
  }

  /** Permanently removes a draft computation. A posted computation has real GL history behind it and must never be deleted, same rule as every other posted-document delete guard in this codebase. */
  async deleteComputation(id: ID): Promise<void> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Expected credit loss computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Cannot delete expected credit loss computation for "${computation.financialYearLabel}": already posted.`);
    }
    return this.repository.delete(id);
  }

  /**
   * Posts the MOVEMENT since the prior posted computation for this company
   * as ONE balanced two-line entry: an increase in the provision debits
   * Impairment Loss (acc_5700) / credits Allowance for Doubtful Debts
   * (acc_1150); a decrease (a reversal) does the reverse. A computation
   * with no real movement still moves to 'posted' with movementAmount 0 and
   * no journalEntryId, mirroring DeferredTaxComputationService's
   * convention. Rejects a computation that is already posted.
   */
  async postComputation(id: ID, postedByUserId?: ID): Promise<EclComputation> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Expected credit loss computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Expected credit loss computation for "${computation.financialYearLabel}" has already been posted.`);
    }

    const allForCompany = await this.repository.getByCompany(computation.companyId);
    const prior = findMostRecentPostedEclBefore(allForCompany, computation.companyId, computation.asOfDate, computation.id);

    const priorTotal = prior?.totalExpectedCreditLoss ?? 0;
    const movementAmount = round2(computation.totalExpectedCreditLoss - priorTotal);
    const now = new Date().toISOString();

    if (Math.abs(movementAmount) <= EPSILON) {
      return this.repository.update(id, {
        status: 'posted',
        priorTotalExpectedCreditLoss: prior?.totalExpectedCreditLoss,
        movementAmount: 0,
        postedAt: now,
        postedByUserId,
      });
    }

    const memo = `Expected credit loss movement - ${computation.financialYearLabel}`;
    const [impairmentLossId, allowanceId] = await Promise.all([
      this.accounts.getAccountId('IMPAIRMENT_LOSS'),
      this.accounts.getAccountId('ALLOWANCE_FOR_DOUBTFUL_DEBTS'),
    ]);
    const lines: NewJournalLineInput[] =
      movementAmount > 0
        ? [
            { accountId: impairmentLossId, description: memo, debit: round2(movementAmount), credit: 0 },
            { accountId: allowanceId, description: memo, debit: 0, credit: round2(movementAmount) },
          ]
        : [
            { accountId: allowanceId, description: memo, debit: round2(-movementAmount), credit: 0 },
            { accountId: impairmentLossId, description: memo, debit: 0, credit: round2(-movementAmount) },
          ];

    const entry = await this.journalPoster.postJournalEntry({
      date: computation.asOfDate,
      memo,
      source: 'expected_credit_loss',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, {
      status: 'posted',
      journalEntryId: entry.id,
      priorTotalExpectedCreditLoss: prior?.totalExpectedCreditLoss,
      movementAmount,
      postedAt: now,
      postedByUserId,
    });
  }
}
