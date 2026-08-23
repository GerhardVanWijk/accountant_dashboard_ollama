import type { Company, DeferredTaxComputation, DeferredTaxTemporaryDifference, FinancialYear, ID, JournalEntry } from '@/types';
import type { IDeferredTaxComputationRepository } from '../repositories/IDeferredTaxComputationRepository';
import type { IncomeTaxConfigService } from '@/features/tax/incomeTax/services/incomeTaxConfigService';
import type { TaxRegisterRow } from '@/features/assets/services/taxRegisterService';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import {
  calculateDeferredTaxTotals,
  EPSILON,
  findMostRecentPostedBefore,
  recalculateItem,
  round2,
  suggestFixedAssetTemporaryDifferences,
} from './deferredTaxCalculations';

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
export interface TaxRegisterLookup {
  getTaxRegister(asOfDate: string): Promise<TaxRegisterRow[]>;
}

export interface PreparedDeferredTaxComputation {
  taxRatePercent: number;
  taxConfigId: ID;
  taxConfigTaxYearLabel: string;
  suggestedItems: DeferredTaxTemporaryDifference[];
}

/**
 * Deferred tax engine (SA_ACCOUNTING_MASTER_SPEC.md §50, §116 Phase 12
 * "Advanced Accounting") — draft-then-post lifecycle matching every other
 * computation in this codebase (TaxComputation/PayrollRun/
 * DepreciationService's run). Explicitly NOT `accountingProfit x taxRate`
 * (the spec forbids that shortcut): every item is a real temporary
 * difference, auto-suggested from the Fixed Asset Tax Register
 * (`taxRegisterService.getTaxRegister()`, the one source of temporary
 * differences this codebase can compute without guessing) plus any manual
 * items the user adds (a provision, an assessed tax loss — no automatic
 * source exists for those, same "auto-suggest what's real, let the user
 * add the rest" pattern `TaxComputation.adjustments` already uses).
 *
 * `postComputation()` posts only the MOVEMENT since the prior POSTED
 * computation for this company (`findMostRecentPostedBefore()`) — unlike
 * TaxComputation (which posts the FULL current-year liability every time),
 * deferred tax is a balance-sheet position that accumulates. A Deferred Tax
 * Asset only ever contributes to the total if its `recognized` flag is
 * true — a forward-looking judgment ("probable future taxable profit will
 * be available", §50) this system cannot make on its own, so it defaults
 * to false and requires the accountant to confirm it, mirroring
 * `Company.isSbcEligible`'s reason-required-override pattern (though here
 * the flag lives per-item, not per-company, since recognition is a
 * per-temporary-difference judgment).
 *
 * Deliberately does NOT apply the SBC progressive bracket table — every
 * item uses the flat corporate rate from the effective `IncomeTaxYearConfig`
 * regardless of `Company.isSbcEligible`. Deferred tax should in principle
 * use the rate expected to apply when a temporary difference REVERSES,
 * which for an SBC company's progressive brackets is genuinely ambiguous
 * (which bracket will taxable income sit in years from now?) — applying one
 * flat rate to every item is a documented simplification, not an
 * oversight; §110/§111 apply.
 */
export class DeferredTaxComputationService {
  constructor(
    private readonly repository: IDeferredTaxComputationRepository,
    private readonly financialYearLookup: FinancialYearLookup,
    private readonly companyLookup: CompanyLookup,
    private readonly taxRegisterLookup: TaxRegisterLookup,
    private readonly configService: Pick<IncomeTaxConfigService, 'getConfigForDate' | 'getById'>,
    private readonly journalPoster: JournalPoster,
    private readonly accounts: AccountMapper,
  ) {}

  async getComputations(): Promise<DeferredTaxComputation[]> {
    return this.repository.getAll();
  }

  async getComputation(id: ID): Promise<DeferredTaxComputation | undefined> {
    return this.repository.getById(id);
  }

  async getComputationForFinancialYear(financialYearId: ID): Promise<DeferredTaxComputation | undefined> {
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
      throw new Error('No company record found — cannot compute deferred tax without a company.');
    }
    return company;
  }

  /**
   * Computes the effective tax rate and every suggested temporary-
   * difference item for a financial year end, WITHOUT persisting anything
   * — exposed separately so the UI (or createComputation() below) can
   * preview before/while creating the draft.
   */
  async prepareComputation(financialYearId: ID): Promise<PreparedDeferredTaxComputation> {
    const financialYear = await this.resolveFinancialYear(financialYearId);
    const config = await this.configService.getConfigForDate(new Date(financialYear.endDate));
    if (!config) {
      throw new Error(
        `No income tax configuration covers a year of assessment ending ${financialYear.endDate} — add an IncomeTaxYearConfig for the relevant SARS year first.`,
      );
    }

    const taxRegisterRows = await this.taxRegisterLookup.getTaxRegister(financialYear.endDate);
    const suggestedItems = suggestFixedAssetTemporaryDifferences(taxRegisterRows, config.corporateTaxRatePercent);

    return {
      taxRatePercent: config.corporateTaxRatePercent,
      taxConfigId: config.id,
      taxConfigTaxYearLabel: config.taxYearLabel,
      suggestedItems,
    };
  }

  /**
   * Creates a new draft DeferredTaxComputation as of the financial year's
   * own end date (deferred tax is measured at a reporting date, and this
   * codebase's only real reporting dates are financial year ends — same
   * boundary TaxComputation posts at). Idempotency guard: rejects a
   * financial year that already has ANY computation (draft or posted),
   * same class of guard as TaxComputationService.createComputation().
   */
  async createComputation(financialYearId: ID): Promise<DeferredTaxComputation> {
    const existing = await this.repository.getByFinancialYear(financialYearId);
    if (existing) {
      throw new Error(
        `Financial year "${financialYearId}" already has a ${existing.status} deferred tax computation ("${existing.id}"). Delete the draft first if you need to recompute.`,
      );
    }

    const financialYear = await this.resolveFinancialYear(financialYearId);
    const company = await this.resolveCompany();
    const { taxRatePercent, taxConfigId, taxConfigTaxYearLabel, suggestedItems } = await this.prepareComputation(financialYearId);
    const totals = calculateDeferredTaxTotals(suggestedItems);

    const now = new Date().toISOString();
    return this.repository.create({
      id: '',
      companyId: company.id,
      financialYearId,
      financialYearLabel: financialYear.name,
      asOfDate: financialYear.endDate,
      status: 'draft',
      taxRatePercent,
      taxConfigId,
      taxConfigTaxYearLabel,
      items: suggestedItems,
      ...totals,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Replaces a draft's items and recomputes each one (classification/
   * temporaryDifference/deferredTaxAmount) plus the totals through the SAME
   * calculation functions createComputation() used — never trust a
   * caller-supplied deferredTaxAmount, always re-derive it from
   * carryingAmount/taxBase/recognized. taxRatePercent/taxConfigId are NOT
   * recomputed here — they stay pinned to whatever createComputation()
   * snapshotted, mirroring updateAdjustments()'s "editing amounts can never
   * silently change which config year applied" rule.
   */
  async updateItems(id: ID, items: DeferredTaxTemporaryDifference[]): Promise<DeferredTaxComputation> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Deferred tax computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Cannot edit deferred tax computation for "${computation.financialYearLabel}": it has already been posted.`);
    }

    const recalculated = items.map((item) => recalculateItem(item, computation.taxRatePercent));
    const totals = calculateDeferredTaxTotals(recalculated);

    return this.repository.update(id, { items: recalculated, ...totals });
  }

  /** Permanently removes a draft computation. A posted computation has real GL history behind it and must never be deleted, same rule as every other posted-document delete guard in this codebase. */
  async deleteComputation(id: ID): Promise<void> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Deferred tax computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Cannot delete deferred tax computation for "${computation.financialYearLabel}": already posted.`);
    }
    return this.repository.delete(id);
  }

  /**
   * Posts the MOVEMENT since the prior posted computation for this company
   * (§50 "movements"/"reconciliation") as ONE balanced entry, using the
   * "debits and credits as vectors" technique already established in
   * journalEntryService.ts: a signed movement per account (Deferred Tax
   * Liability, Deferred Tax Asset, Deferred Tax Expense), one line emitted
   * per account with a non-zero net movement. A computation with no real
   * movement (first-ever computation with zero temporary differences, or a
   * re-measurement that happens to net to nothing) still moves to
   * 'posted' with movementAmount 0 and no journalEntryId — mirroring
   * TaxComputation's "undefined means nothing was posted" convention.
   * Rejects a computation that is already posted (idempotency guard, same
   * class as PurchaseOrderService.recordReceipt()'s already-received
   * guard).
   */
  async postComputation(id: ID, postedByUserId?: ID): Promise<DeferredTaxComputation> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Deferred tax computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Deferred tax computation for "${computation.financialYearLabel}" has already been posted.`);
    }

    const allForCompany = await this.repository.getByCompany(computation.companyId);
    const prior = findMostRecentPostedBefore(allForCompany, computation.companyId, computation.asOfDate, computation.id);

    const priorDTL = prior?.totalDeferredTaxLiability ?? 0;
    const priorDTA = prior?.totalDeferredTaxAsset ?? 0;
    const deltaDTL = round2(computation.totalDeferredTaxLiability - priorDTL);
    const deltaDTA = round2(computation.totalDeferredTaxAsset - priorDTA);
    const movementAmount = round2(deltaDTL - deltaDTA);

    const now = new Date().toISOString();

    const [deferredTaxLiabilityId, deferredTaxAssetId, deferredTaxExpenseId] = await Promise.all([
      this.accounts.getAccountId('DEFERRED_TAX_LIABILITY'),
      this.accounts.getAccountId('DEFERRED_TAX_ASSET'),
      this.accounts.getAccountId('DEFERRED_TAX_EXPENSE'),
    ]);
    const vectors = new Map<string, number>();
    // Deferred Tax Liability is credit-normal: an INCREASE in the liability is a credit, a NEGATIVE debit-vector.
    if (Math.abs(deltaDTL) > EPSILON) vectors.set(deferredTaxLiabilityId, -deltaDTL);
    // Deferred Tax Asset is debit-normal: an INCREASE in the asset is a debit, a POSITIVE debit-vector.
    if (Math.abs(deltaDTA) > EPSILON) vectors.set(deferredTaxAssetId, deltaDTA);
    if (Math.abs(movementAmount) > EPSILON) vectors.set(deferredTaxExpenseId, movementAmount);

    if (vectors.size < 2) {
      return this.repository.update(id, {
        status: 'posted',
        priorNetDeferredTaxLiability: prior?.netDeferredTaxLiability,
        movementAmount: 0,
        postedAt: now,
        postedByUserId,
      });
    }

    const memo = `Deferred tax movement - ${computation.financialYearLabel} (${computation.taxConfigTaxYearLabel})`;
    const lines: NewJournalLineInput[] = [...vectors].map(([accountId, vector]) => ({
      accountId,
      description: memo,
      debit: vector > 0 ? round2(vector) : 0,
      credit: vector < 0 ? round2(-vector) : 0,
    }));

    const entry = await this.journalPoster.postJournalEntry({
      date: computation.asOfDate,
      memo,
      source: 'deferred_tax',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, {
      status: 'posted',
      journalEntryId: entry.id,
      priorNetDeferredTaxLiability: prior?.netDeferredTaxLiability,
      movementAmount,
      postedAt: now,
      postedByUserId,
    });
  }
}
