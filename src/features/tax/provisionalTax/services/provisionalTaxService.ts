import type { Company, FinancialYear, ID, IncomeTaxYearConfig, JournalEntry, TaxComputation } from '@/types';
import type {
  ProvisionalPaymentSlot,
  ProvisionalPaymentSlotName,
  ProvisionalTaxPeriod,
  ProvisionalTaxReconciliation,
} from '@/types/provisionalTax';
import type { IProvisionalTaxPeriodRepository } from '../repositories/IProvisionalTaxPeriodRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import { calculateTaxLiability } from '@/features/tax/incomeTax/services';
import { calculateProvisionalTaxDueDates } from '../utils/provisionalTaxDueDates';

/** Half a cent — same rounding tolerance used across every other posting service in this codebase. */
const EPSILON = 0.005;

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
export interface FinancialYearLookup {
  getFinancialYears(): Promise<FinancialYear[]>;
}
export interface CompanyLookup {
  getCompanies(): Promise<Company[]>;
}
/** Narrow surface of IncomeTaxConfigService this service depends on — resolving the effective corporate-tax/SBC config for a financial year end date is all it needs. */
export interface IncomeTaxConfigLookup {
  getConfigForDate(date: Date): Promise<IncomeTaxYearConfig | undefined>;
}
/**
 * Narrow surface of TaxComputationService (src/features/tax/incomeTax/) this
 * service consumes for §54's reconciliation — the FINAL tax liability for a
 * financial year, once one has been computed and posted.
 */
export interface TaxComputationLookup {
  getComputationForFinancialYear(financialYearId: ID): Promise<TaxComputation | undefined>;
}

function emptySlot(dueDate: Date): ProvisionalPaymentSlot {
  return { dueDate: dueDate.toISOString() };
}

function slotLabel(slot: ProvisionalPaymentSlotName): string {
  switch (slot) {
    case 'first':
      return 'First provisional tax payment';
    case 'second':
      return 'Second provisional tax payment';
    case 'topUp':
      return 'Top-up (third) provisional tax payment';
  }
}

/**
 * Provisional tax lifecycle (SA_ACCOUNTING_MASTER_SPEC.md §54 — Phase 9
 * "Tax", Wave 2, built once the Income Tax engine — §51/§52/§53 — existed).
 * One ProvisionalTaxPeriod per company FinancialYear holds the first,
 * second, and voluntary top-up payment slots together (see
 * ProvisionalTaxPeriod's doc comment), since they share one estimate
 * lifecycle and one reconciliation view.
 *
 * Every estimate reuses calculateTaxLiability() from the Income Tax module
 * (src/features/tax/incomeTax/services/taxComputationCalculations.ts) —
 * never a second SBC-bracket or flat-rate implementation.
 *
 * No new GL account is introduced: a provisional tax payment is simply an
 * early payment AGAINST the same liability TaxComputationService.
 * postComputation() will eventually credit at year-end — DR Income Tax
 * Payable (acc_2300) / CR Cash and Bank (acc_1000). This naturally nets
 * against the final entry: if provisional payments were exactly right, the
 * account nets to zero after the final posting; if not, the remaining
 * balance IS the underpayment/overpayment, visible on the Trial Balance /
 * General Ledger like any other control account — no separate accounting
 * needed for "the reconciliation," it falls out of the GL for free.
 * getReconciliation() below only re-surfaces that same diff as a
 * convenience read model, it never posts anything extra.
 *
 * Deliberately NOT implemented (§110 "no unsupported claims"): any
 * underpayment INTEREST/penalty calculation — SARS's provisional-tax
 * underpayment interest rate floats with the prevailing repo rate rather
 * than being a fixed statutory figure the way VAT/PAYE/Dividends rates are
 * seeded in this codebase. getReconciliation() surfaces the plain Rand-value
 * gap only; computing interest on that gap requires the current
 * SARS-published rate, out of scope here — this is a professional-review
 * item (§111), not something this module guesses at.
 */
export class ProvisionalTaxService {
  constructor(
    private readonly repository: IProvisionalTaxPeriodRepository,
    private readonly financialYearLookup: FinancialYearLookup,
    private readonly companyLookup: CompanyLookup,
    private readonly configLookup: IncomeTaxConfigLookup,
    private readonly journalPoster: JournalPoster,
    private readonly taxComputationLookup: TaxComputationLookup,
    private readonly accounts: AccountMapper,
  ) {}

  async getPeriods(): Promise<ProvisionalTaxPeriod[]> {
    return this.repository.getAll();
  }

  async getPeriod(id: ID): Promise<ProvisionalTaxPeriod | undefined> {
    return this.repository.getById(id);
  }

  async getPeriodForFinancialYear(financialYearId: ID): Promise<ProvisionalTaxPeriod | undefined> {
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
      throw new Error('No company record found — cannot compute provisional tax without a company.');
    }
    return company;
  }

  /**
   * Fetches the existing ProvisionalTaxPeriod for a financial year, or
   * creates one with due dates computed via calculateProvisionalTaxDueDates()
   * and every slot empty (no estimate/payment yet). Idempotent — same class
   * of "one record per financial year" guard as
   * TaxComputationService.createComputation(), except get-or-create rather
   * than reject: calling this twice is never destructive, unlike creating a
   * second draft TaxComputation would be.
   */
  async getOrCreatePeriod(financialYearId: ID): Promise<ProvisionalTaxPeriod> {
    const existing = await this.repository.getByFinancialYear(financialYearId);
    if (existing) {
      return existing;
    }

    const financialYear = await this.resolveFinancialYear(financialYearId);
    const company = await this.resolveCompany();
    const dueDates = calculateProvisionalTaxDueDates(financialYear);
    const now = new Date().toISOString();

    return this.repository.create({
      id: '',
      companyId: company.id,
      financialYearId,
      financialYearLabel: financialYear.name,
      first: emptySlot(dueDates.first),
      second: emptySlot(dueDates.second),
      topUp: emptySlot(dueDates.topUp),
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Records/updates a taxable-income estimate for one payment slot,
   * recomputing estimatedTaxLiability through the SAME calculateTaxLiability()
   * function the Income Tax module uses. Rejects a slot that has already
   * been paid — the estimate behind a real payment is locked in as history,
   * same rationale as TaxComputationService.updateAdjustments() rejecting an
   * edit to a posted computation.
   */
  async recordEstimate(periodId: ID, slot: ProvisionalPaymentSlotName, estimatedTaxableIncome: number): Promise<ProvisionalTaxPeriod> {
    const period = await this.repository.getById(periodId);
    if (!period) {
      throw new Error(`Provisional tax period "${periodId}" not found.`);
    }
    if (period[slot].paidDate) {
      throw new Error(`Cannot change the estimate for the "${slotLabel(slot)}": it has already been paid.`);
    }

    const financialYear = await this.resolveFinancialYear(period.financialYearId);
    const company = await this.resolveCompany();
    const config = await this.configLookup.getConfigForDate(new Date(financialYear.endDate));
    if (!config) {
      throw new Error(
        `No income tax configuration covers a year of assessment ending ${financialYear.endDate} — add an IncomeTaxYearConfig for the relevant SARS year first.`,
      );
    }

    const isSbcEligible = company.isSbcEligible ?? false;
    const estimatedTaxLiability = calculateTaxLiability(estimatedTaxableIncome, isSbcEligible, config);

    const updatedSlot: ProvisionalPaymentSlot = {
      ...period[slot],
      estimatedTaxableIncome: round2(estimatedTaxableIncome),
      estimatedTaxLiability,
    };
    const patch = { [slot]: updatedSlot } as Partial<ProvisionalTaxPeriod>;

    return this.repository.update(periodId, patch);
  }

  /**
   * Pays a provisional tax slot: ONE balanced journal entry — DR Income Tax
   * Payable (acc_2300) / CR Cash and Bank (acc_1000) for `amountPaid` — see
   * class doc comment for why no new GL account exists for this. Rejects an
   * already-paid slot (idempotency guard, same class as
   * PurchaseOrderService.recordReceipt()'s already-received guard) and a
   * non-positive amount.
   */
  async payProvisionalTax(
    periodId: ID,
    slot: ProvisionalPaymentSlotName,
    amountPaid: number,
    date?: string,
    postedByUserId?: ID,
  ): Promise<ProvisionalTaxPeriod> {
    const period = await this.repository.getById(periodId);
    if (!period) {
      throw new Error(`Provisional tax period "${periodId}" not found.`);
    }
    if (period[slot].paidDate) {
      throw new Error(`The "${slotLabel(slot)}" has already been recorded as paid.`);
    }
    if (amountPaid <= EPSILON) {
      throw new Error('Amount paid must be greater than 0.');
    }

    const paidDate = date ?? new Date().toISOString().slice(0, 10);
    const memo = `${slotLabel(slot)} - ${period.financialYearLabel}`;

    const [incomeTaxPayableId, cashAndBankId] = await Promise.all([
      this.accounts.getAccountId('INCOME_TAX_PAYABLE'),
      this.accounts.getAccountId('CASH_AND_BANK'),
    ]);
    const lines: NewJournalLineInput[] = [
      { accountId: incomeTaxPayableId, description: memo, debit: round2(amountPaid), credit: 0 },
      { accountId: cashAndBankId, description: memo, debit: 0, credit: round2(amountPaid) },
    ];

    const entry = await this.journalPoster.postJournalEntry({
      date: paidDate,
      memo,
      source: 'provisional_tax',
      lines,
      postedByUserId,
    });

    const updatedSlot: ProvisionalPaymentSlot = {
      ...period[slot],
      amountPaid: round2(amountPaid),
      paidDate,
      journalEntryId: entry.id,
    };
    const patch = { [slot]: updatedSlot } as Partial<ProvisionalTaxPeriod>;

    return this.repository.update(periodId, patch);
  }

  /**
   * §54's reconciliation: sum of every slot's actual amountPaid vs. the
   * financial year's FINAL posted TaxComputation.taxLiability, once one
   * exists — never recomputes tax liability a second way, just diffs
   * numbers already computed by the Income Tax module. `finalTaxLiability`/
   * `variance` stay undefined until a posted TaxComputation exists for the
   * financial year. A positive `variance` is still owed to SARS; negative is
   * an overpayment/refund position. Returns undefined if no
   * ProvisionalTaxPeriod exists yet for the financial year at all.
   */
  async getReconciliation(financialYearId: ID): Promise<ProvisionalTaxReconciliation | undefined> {
    const period = await this.repository.getByFinancialYear(financialYearId);
    if (!period) {
      return undefined;
    }

    const totalPaid = round2([period.first, period.second, period.topUp].reduce((sum, s) => sum + (s.amountPaid ?? 0), 0));

    const computation = await this.taxComputationLookup.getComputationForFinancialYear(financialYearId);
    if (!computation || computation.status !== 'posted') {
      return { financialYearId, totalPaid };
    }

    const finalTaxLiability = computation.taxLiability;
    const variance = round2(finalTaxLiability - totalPaid);

    return { financialYearId, totalPaid, finalTaxLiability, variance };
  }
}
