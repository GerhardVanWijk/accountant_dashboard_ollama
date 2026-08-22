import type {
  Account,
  AssetDisposal,
  Company,
  FinancialYear,
  FixedAsset,
  ID,
  JournalEntry,
  TaxAdjustment,
  TaxComputation,
} from '@/types';
import type { ITaxComputationRepository } from '../repositories/ITaxComputationRepository';
import type { IncomeTaxConfigService } from './incomeTaxConfigService';
import type { NewJournalLineInput } from '@/features/accounting/services';
import {
  calculateAccountingProfit,
  calculateDepreciationAddback,
  calculateTaxableIncome,
  calculateTaxLiability,
  calculateWearAndTearAllowanceForPeriod,
  suggestDisposalAddbackAdjustments,
} from './taxComputationCalculations';

/** Half a cent — same rounding tolerance used across every other posting service in this codebase. */
const EPSILON = 0.005;

/** Fixed GL account ids (src/mock-data/accounts.ts) — see docs/KNOWN_ISSUES.md's Phase 9 note: Deferred Tax accounts deliberately do NOT exist yet (§50 is Phase 12). */
const INCOME_TAX_EXPENSE_ACCOUNT_ID = 'acc_5500';
const INCOME_TAX_PAYABLE_ACCOUNT_ID = 'acc_2300';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

/** Minimal surface each dependency needs — same "narrow interface, real singleton injected in services/index.ts" pattern every other module in this codebase uses. */
export interface JournalEntryLookup {
  getEntries(): Promise<JournalEntry[]>;
}
export interface AccountLookup {
  getAccounts(): Promise<Account[]>;
}
export interface FinancialYearLookup {
  getFinancialYears(): Promise<FinancialYear[]>;
}
export interface CompanyLookup {
  getCompanies(): Promise<Company[]>;
}
export interface FixedAssetLookup {
  getFixedAssets(): Promise<FixedAsset[]>;
}
export interface AssetDisposalLookup {
  getDisposals(): Promise<AssetDisposal[]>;
}
/**
 * Narrow surface of CapitalGainsService (src/features/tax/capitalGains/)
 * this service optionally consumes — added by Queen Bee in a follow-up
 * integration pass once the capital-gains module (built in parallel by a
 * separate bee) landed. Optional and constructor-injected last so the
 * income-tax bee's own existing tests (which construct
 * TaxComputationService without a 10th argument) keep passing unchanged.
 */
export interface CapitalGainsLookup {
  getPeriodReport(
    periodStart: Date,
    periodEnd: Date,
    legalEntityType: Company['legalEntityType'],
  ): Promise<{ taxableCapitalGain: number; netCapitalLossForPeriod: number }>;
}

export interface PreparedTaxComputation {
  accountingProfit: number;
  suggestedAdjustments: TaxAdjustment[];
}

let suggestionSeq = 0;
function nextSuggestionId(prefix: string): string {
  suggestionSeq += 1;
  return `${prefix}_${suggestionSeq}`;
}

/**
 * The corporate income tax reconciliation & computation engine
 * (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 9 "Tax", §51/§52/§53). A
 * TaxComputation is created as 'draft' with accounting profit and a set of
 * SUGGESTED adjustment lines computed up front (wear-and-tear allowance,
 * depreciation add-back, one line per Fixed Asset disposal in the period,
 * one capital-gain/recoupment line) — the same create-draft-then-explicit-
 * post pattern PayrollRunService uses, so every number can be reviewed/
 * overridden (§111: "professional review required", this is guidance, not
 * gospel) before anything touches the GL. postComputation() then posts ONE
 * journal entry (DR Income Tax Expense / CR Income Tax Payable), mirroring
 * DepreciationService.runDepreciation()'s one-entry-per-run design.
 *
 * The 'recoupment_or_capital_gain' line is pre-filled from the real
 * Capital Gains Tax module (src/features/tax/capitalGains/) via the
 * optional `capitalGainsLookup` constructor dependency — wired to the real
 * `capitalGainsService` singleton in this feature's services/index.ts (a
 * Queen Bee integration pass after both modules landed; proven by the
 * "pre-fills the capital-gain adjustment from an injected
 * CapitalGainsLookup" test). It only falls back to a manual zero-amount
 * placeholder when no `capitalGainsLookup` is supplied at construction
 * (e.g. an isolated unit test).
 *
 * Deliberately NOT implemented (see docs/KNOWN_ISSUES.md /
 * docs/SA_SPEC_GAP_ANALYSIS.md): Deferred Tax (§50, Phase 12); Provisional
 * Tax (§54, planned as a sequential Wave 2 once this engine existed); any
 * reversal/correction path once a computation is posted.
 */
export class TaxComputationService {
  constructor(
    private readonly repository: ITaxComputationRepository,
    private readonly journalLookup: JournalEntryLookup,
    private readonly accountLookup: AccountLookup,
    private readonly financialYearLookup: FinancialYearLookup,
    private readonly companyLookup: CompanyLookup,
    private readonly fixedAssetLookup: FixedAssetLookup,
    private readonly disposalLookup: AssetDisposalLookup,
    private readonly configService: Pick<IncomeTaxConfigService, 'getConfigForDate' | 'getById'>,
    private readonly journalPoster: JournalPoster,
    private readonly capitalGainsLookup?: CapitalGainsLookup,
  ) {}

  async getComputations(): Promise<TaxComputation[]> {
    return this.repository.getAll();
  }

  async getComputation(id: ID): Promise<TaxComputation | undefined> {
    return this.repository.getById(id);
  }

  async getComputationForFinancialYear(financialYearId: ID): Promise<TaxComputation | undefined> {
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
      throw new Error('No company record found — cannot compute income tax without a company.');
    }
    return company;
  }

  /**
   * Computes accounting profit and every suggested adjustment line for a
   * financial year WITHOUT persisting anything — exposed separately so the
   * UI (or createComputation() below) can preview the reconciliation
   * before/while creating the draft.
   */
  async prepareComputation(financialYearId: ID): Promise<PreparedTaxComputation> {
    const financialYear = await this.resolveFinancialYear(financialYearId);
    const [entries, accounts, assets, disposals] = await Promise.all([
      this.journalLookup.getEntries(),
      this.accountLookup.getAccounts(),
      this.fixedAssetLookup.getFixedAssets(),
      this.disposalLookup.getDisposals(),
    ]);

    const accountingProfit = calculateAccountingProfit(entries, accounts, financialYear.startDate, financialYear.endDate);
    const depreciationAddback = calculateDepreciationAddback(entries, financialYear.startDate, financialYear.endDate);
    const wearAndTearAllowance = calculateWearAndTearAllowanceForPeriod(assets, financialYear.startDate, financialYear.endDate);
    const disposalAdjustments = suggestDisposalAddbackAdjustments(disposals, assets, financialYear.startDate, financialYear.endDate);

    const suggestedAdjustments: TaxAdjustment[] = [];

    if (depreciationAddback > EPSILON) {
      suggestedAdjustments.push({
        id: nextSuggestionId('sugg_depr'),
        category: 'depreciation_addback',
        description: 'Accounting depreciation charge for the period (not tax-deductible — see wear-and-tear allowance below)',
        amount: depreciationAddback,
        direction: 'add',
      });
    }

    if (wearAndTearAllowance > EPSILON) {
      suggestedAdjustments.push({
        id: nextSuggestionId('sugg_wt'),
        category: 'wear_and_tear_allowance',
        description: 'SARS wear-and-tear allowance for the period (§11(e)/§12C-style allowance, per-asset rate x cost, prorated and capped — see Fixed Asset Register for each asset\'s rate)',
        amount: wearAndTearAllowance,
        direction: 'subtract',
      });
    }

    suggestedAdjustments.push(...disposalAdjustments);

    // Per SA_ACCOUNTING_MASTER_SPEC.md §55: the real taxable capital
    // gain/recoupment figure comes from the capital-gains module
    // (src/features/tax/capitalGains/), wired in via the optional
    // capitalGainsLookup dependency (see CapitalGainsLookup's doc comment)
    // once that module landed. Still user-editable like every other
    // suggested line (§111) — pre-filled, not gospel. Falls back to a
    // manual zero-amount placeholder only if no capitalGainsLookup was
    // injected (e.g. an older/isolated test construction).
    const company = await this.resolveCompany();
    let capitalGainAmount = 0;
    let capitalGainDescription =
      'Taxable recoupment / capital gain from Fixed Asset disposals — enter manually; the capital-gains module is not wired in for this computation.';
    if (this.capitalGainsLookup) {
      const cgtReport = await this.capitalGainsLookup.getPeriodReport(
        new Date(financialYear.startDate),
        new Date(financialYear.endDate),
        company.legalEntityType,
      );
      capitalGainAmount = cgtReport.taxableCapitalGain;
      capitalGainDescription =
        'Taxable capital gain from Fixed Asset disposals this financial year, per the Capital Gains Tax module (/tax/capital-gains) — pre-filled, always editable (§55/§111).' +
        (cgtReport.netCapitalLossForPeriod > EPSILON
          ? ` Note: a net capital LOSS of ${cgtReport.netCapitalLossForPeriod.toFixed(2)} was also computed for the period — not carried forward automatically (see Capital Gains Tax module).`
          : '');
    }
    suggestedAdjustments.push({
      id: nextSuggestionId('sugg_cgt'),
      category: 'recoupment_or_capital_gain',
      description: capitalGainDescription,
      amount: capitalGainAmount,
      direction: 'add',
    });

    return { accountingProfit, suggestedAdjustments };
  }

  /**
   * Creates a new draft TaxComputation for a financial year. Idempotency
   * guard: rejects a financial year that already has ANY computation
   * (draft or posted) — same class of guard as
   * PayrollRunService.createPayrollRun()'s overlapping-pay-period check —
   * delete the stale draft first (deleteComputation()) if you need to
   * recompute; a posted computation can never be superseded this way (see
   * class doc comment's "no reversal path" gap).
   */
  async createComputation(financialYearId: ID): Promise<TaxComputation> {
    const existing = await this.repository.getByFinancialYear(financialYearId);
    if (existing) {
      throw new Error(
        `Financial year "${financialYearId}" already has a ${existing.status} tax computation ("${existing.id}"). Delete the draft first if you need to recompute.`,
      );
    }

    const financialYear = await this.resolveFinancialYear(financialYearId);
    const company = await this.resolveCompany();
    const isSbcEligible = company.isSbcEligible ?? false;

    const config = await this.configService.getConfigForDate(new Date(financialYear.endDate));
    if (!config) {
      throw new Error(
        `No income tax configuration covers a year of assessment ending ${financialYear.endDate} — add an IncomeTaxYearConfig for the relevant SARS year first.`,
      );
    }

    const { accountingProfit, suggestedAdjustments } = await this.prepareComputation(financialYearId);
    const taxableIncome = calculateTaxableIncome(accountingProfit, suggestedAdjustments);
    const taxLiability = calculateTaxLiability(taxableIncome, isSbcEligible, config);

    const now = new Date().toISOString();
    return this.repository.create({
      id: '',
      companyId: company.id,
      financialYearId,
      financialYearLabel: financialYear.name,
      status: 'draft',
      accountingProfit,
      isSbcEligible,
      adjustments: suggestedAdjustments,
      taxableIncome,
      taxConfigId: config.id,
      taxConfigTaxYearLabel: config.taxYearLabel,
      taxLiability,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Replaces a draft's adjustment lines and recomputes taxableIncome/
   * taxLiability through the SAME calculation functions createComputation()
   * used — same "one shared calc, never two implementations to drift
   * apart" principle as depreciationService.calculateMonthlyDepreciation().
   * accountingProfit/isSbcEligible/taxConfigId are NOT recomputed here —
   * they stay pinned to whatever createComputation() snapshotted, so
   * editing adjustment amounts can never silently change which SBC status
   * or config year applied.
   */
  async updateAdjustments(id: ID, adjustments: TaxAdjustment[]): Promise<TaxComputation> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Tax computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Cannot edit tax computation for "${computation.financialYearLabel}": it has already been posted.`);
    }

    const config = await this.configService.getById(computation.taxConfigId);
    if (!config) {
      throw new Error(`Income tax configuration "${computation.taxConfigId}" (used at creation time) no longer exists.`);
    }

    const taxableIncome = calculateTaxableIncome(computation.accountingProfit, adjustments);
    const taxLiability = calculateTaxLiability(taxableIncome, computation.isSbcEligible, config);

    return this.repository.update(id, { adjustments, taxableIncome, taxLiability });
  }

  /** Permanently removes a draft computation. A posted computation has real GL history behind it and must never be deleted (§14/§36/§72/§79), same rule as every other posted-document delete guard in this codebase. */
  async deleteComputation(id: ID): Promise<void> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Tax computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Cannot delete tax computation for "${computation.financialYearLabel}": already posted.`);
    }
    return this.repository.delete(id);
  }

  /**
   * Posts ONE journal entry: DR Income Tax Expense (acc_5500) / CR Income
   * Tax Payable (acc_2300) for taxLiability. A zero-liability computation
   * (a loss year, or an SBC-eligible company whose taxable income sits
   * entirely inside the 0% band) still moves to 'posted' — there is
   * nothing to post to the GL for a nil liability — but journalEntryId
   * stays undefined, mirroring DepreciationRunResult's "undefined means
   * nothing was posted" convention. Rejects a computation that is already
   * posted (idempotency guard, same class as
   * PurchaseOrderService.recordReceipt()'s already-received guard) —
   * combined with createComputation()'s per-financial-year guard, a
   * financial year can never end up with two posted tax computations.
   */
  async postComputation(id: ID, postedByUserId?: ID): Promise<TaxComputation> {
    const computation = await this.repository.getById(id);
    if (!computation) {
      throw new Error(`Tax computation "${id}" not found.`);
    }
    if (computation.status !== 'draft') {
      throw new Error(`Tax computation for "${computation.financialYearLabel}" has already been posted.`);
    }

    const now = new Date().toISOString();

    if (computation.taxLiability <= EPSILON) {
      return this.repository.update(id, { status: 'posted', postedAt: now, postedByUserId });
    }

    // Posted AT the financial year end — tax is accrued/recognized at
    // year-close, same rationale as depreciationService posting at
    // periodEnd rather than "today". postedAt (above/below) still records
    // the real wall-clock time the posting action happened.
    const financialYear = await this.resolveFinancialYear(computation.financialYearId);

    const memo = `Corporate income tax - ${computation.financialYearLabel} (${computation.taxConfigTaxYearLabel})`;
    const lines: NewJournalLineInput[] = [
      { accountId: INCOME_TAX_EXPENSE_ACCOUNT_ID, description: memo, debit: round2(computation.taxLiability), credit: 0 },
      { accountId: INCOME_TAX_PAYABLE_ACCOUNT_ID, description: memo, debit: 0, credit: round2(computation.taxLiability) },
    ];

    const entry = await this.journalPoster.postJournalEntry({
      date: financialYear.endDate,
      memo,
      source: 'income_tax',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, {
      status: 'posted',
      journalEntryId: entry.id,
      postedAt: now,
      postedByUserId,
    });
  }
}
