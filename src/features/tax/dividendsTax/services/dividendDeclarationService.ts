import type { DividendDeclaration, ID, JournalEntry } from '@/types';
import type { IDividendDeclarationRepository } from '../repositories/IDividendDeclarationRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

/** Half a cent — same rounding tolerance as journalEntryService.ts. */
const EPSILON = 0.005;

/** Fixed GL account ids (src/mock-data/accounts.ts) this service posts against. */
const RETAINED_EARNINGS_ACCOUNT_ID = 'acc_3900'; // Retained Earnings
const DIVIDENDS_PAYABLE_ACCOUNT_ID = 'acc_2500'; // Dividends Payable
const DIVIDENDS_TAX_PAYABLE_ACCOUNT_ID = 'acc_2510'; // Dividends Tax Payable (Withholding)
const CASH_AND_BANK_ACCOUNT_ID = 'acc_1000'; // Cash and Bank

/**
 * Minimal surface of JournalEntryService this service depends on — an
 * interface, not the concrete class, mirrors AssetDisposalService's
 * JournalPoster/BillService's JournalPoster exactly.
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

/**
 * Minimal surface of DividendsWithholdingTaxConfigService this service
 * depends on — resolving the rate effective on a given date is all
 * this service needs.
 */
export interface DividendsRateResolver {
  getRateForDate(date: string): Promise<{ ratePercent: number } | undefined>;
}

export interface CreateDividendDeclarationInput {
  declarationDate: string;
  /** Gross dividend declared, before any withholding. Must be > 0. */
  totalAmount: number;
  /** Manual override amount exempt from withholding (e.g. s64F). Must be 0 <= exemptPortion <= totalAmount. Defaults to 0. */
  exemptPortion?: number;
  /** Required whenever exemptPortion > 0 — mirrors TaxRateService.supersede()'s reason-required-override pattern. */
  exemptionReason?: string;
  notes?: string;
}

export type UpdateDraftDividendDeclarationInput = Partial<CreateDividendDeclarationInput>;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Rounds an amount produced by a caller-supplied `date the end of the
 * following month` calculation for display only — see
 * `getRemittanceDueDateHint()` below.
 */
function endOfFollowingMonth(dateIso: string): string {
  const d = new Date(dateIso);
  // First day of the month AFTER the month following `d`'s month, minus one day
  // = last day of the month following `d`'s month.
  const lastDayOfFollowingMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0));
  return lastDayOfFollowingMonth.toISOString().slice(0, 10);
}

/**
 * Dividend declaration/payment/remittance lifecycle
 * (SA_ACCOUNTING_MASTER_SPEC.md §56). See DividendDeclaration's doc
 * comment (src/types/dividendsTax.ts) for the no-shareholder-register
 * scope note — every amount here is gross/company-wide, never
 * allocated to an individual shareholder.
 *
 * Lifecycle: draft -[declare()]-> declared -[pay()]-> paid
 * -[remitToSars()]-> remitted. Exactly one balanced journal entry is
 * posted per transition, matching this codebase's "GL posts, then
 * status flips" ordering (see BillService.postBill()). Each guard
 * rejects an out-of-order call the same way
 * PurchaseOrderService.recordReceipt() rejects an already-received PO.
 */
export class DividendDeclarationService {
  constructor(
    private readonly repository: IDividendDeclarationRepository,
    private readonly journalPoster: JournalPoster,
    private readonly rateResolver: DividendsRateResolver,
  ) {}

  async getDeclarations(): Promise<DividendDeclaration[]> {
    return this.repository.getAll();
  }

  async getDeclaration(id: ID): Promise<DividendDeclaration | undefined> {
    return this.repository.getById(id);
  }

  /**
   * Computes taxableAmount/dividendsTaxWithheld/netPayableToShareholders
   * from totalAmount/exemptPortion/declarationDate, resolving the
   * Dividends Withholding Tax rate effective on declarationDate. Throws
   * if no rate config covers that date, if amounts are invalid, or if
   * exemptPortion > 0 without an exemptionReason.
   */
  private async computeFields(input: {
    declarationDate: string;
    totalAmount: number;
    exemptPortion: number;
    exemptionReason?: string;
  }): Promise<Pick<DividendDeclaration, 'taxableAmount' | 'ratePercentApplied' | 'dividendsTaxWithheld' | 'netPayableToShareholders'>> {
    if (input.totalAmount <= 0) {
      throw new Error('Dividend total amount must be greater than 0.');
    }
    if (input.exemptPortion < 0) {
      throw new Error('Exempt portion cannot be negative.');
    }
    if (input.exemptPortion > input.totalAmount + EPSILON) {
      throw new Error('Exempt portion cannot exceed the total dividend amount.');
    }
    if (input.exemptPortion > EPSILON && !input.exemptionReason?.trim()) {
      throw new Error('An exemption reason is required whenever an exempt portion is entered.');
    }

    const rateConfig = await this.rateResolver.getRateForDate(input.declarationDate);
    if (!rateConfig) {
      throw new Error(`No Dividends Withholding Tax rate is configured for ${input.declarationDate}.`);
    }

    const taxableAmount = round2(input.totalAmount - input.exemptPortion);
    const dividendsTaxWithheld = round2((taxableAmount * rateConfig.ratePercent) / 100);
    const netPayableToShareholders = round2(input.totalAmount - dividendsTaxWithheld);

    return {
      taxableAmount,
      ratePercentApplied: rateConfig.ratePercent,
      dividendsTaxWithheld,
      netPayableToShareholders,
    };
  }

  /** Creates a new draft declaration with the computed withholding fields populated for preview. */
  async createDeclaration(input: CreateDividendDeclarationInput): Promise<DividendDeclaration> {
    const exemptPortion = input.exemptPortion ?? 0;
    const computed = await this.computeFields({
      declarationDate: input.declarationDate,
      totalAmount: input.totalAmount,
      exemptPortion,
      exemptionReason: input.exemptionReason,
    });

    return this.repository.create({
      id: '',
      declarationDate: input.declarationDate,
      totalAmount: input.totalAmount,
      exemptPortion,
      exemptionReason: input.exemptionReason,
      status: 'draft',
      notes: input.notes,
      ...computed,
      createdAt: '',
      updatedAt: '',
    });
  }

  /** Updates a draft's inputs and recomputes the withholding fields. Rejects once the declaration has left 'draft'. */
  async updateDraftDeclaration(id: ID, patch: UpdateDraftDividendDeclarationInput): Promise<DividendDeclaration> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Dividend declaration "${id}" not found.`);
    }
    if (existing.status !== 'draft') {
      throw new Error(`Cannot edit dividend declaration "${id}": only a draft can be edited (current status: ${existing.status}).`);
    }

    const declarationDate = patch.declarationDate ?? existing.declarationDate;
    const totalAmount = patch.totalAmount ?? existing.totalAmount;
    const exemptPortion = patch.exemptPortion ?? existing.exemptPortion;
    const exemptionReason = patch.exemptionReason ?? existing.exemptionReason;

    const computed = await this.computeFields({ declarationDate, totalAmount, exemptPortion, exemptionReason });

    return this.repository.update(id, {
      declarationDate,
      totalAmount,
      exemptPortion,
      exemptionReason,
      notes: patch.notes ?? existing.notes,
      ...computed,
    });
  }

  /** Permanently removes a draft declaration. Once declared it's accounting history and must never be deleted. */
  async deleteDraftDeclaration(id: ID): Promise<void> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      throw new Error(`Dividend declaration "${id}" not found.`);
    }
    if (existing.status !== 'draft') {
      throw new Error(`Cannot delete dividend declaration "${id}": only a draft can be deleted (current status: ${existing.status}).`);
    }
    return this.repository.delete(id);
  }

  /**
   * Declares the dividend: DR Retained Earnings / CR Dividends Payable
   * for the full gross `totalAmount` — declaring a dividend reduces
   * distributable equity immediately, regardless of withholding (which
   * only happens at payment). Rejects a non-draft record (idempotency
   * guard, same class as PurchaseOrderService.recordReceipt()'s
   * already-received guard).
   */
  async declare(id: ID, postedByUserId?: ID): Promise<DividendDeclaration> {
    const declaration = await this.repository.getById(id);
    if (!declaration) {
      throw new Error(`Dividend declaration "${id}" not found.`);
    }
    if (declaration.status !== 'draft') {
      throw new Error(`Cannot declare dividend "${id}": only a draft can be declared (current status: ${declaration.status}).`);
    }

    const lines: NewJournalLineInput[] = [
      {
        accountId: RETAINED_EARNINGS_ACCOUNT_ID,
        description: `Dividend declared ${declaration.declarationDate}`,
        debit: declaration.totalAmount,
        credit: 0,
      },
      {
        accountId: DIVIDENDS_PAYABLE_ACCOUNT_ID,
        description: `Dividend declared ${declaration.declarationDate}`,
        debit: 0,
        credit: declaration.totalAmount,
      },
    ];

    const entry = await this.journalPoster.postJournalEntry({
      date: declaration.declarationDate,
      memo: `Dividend declaration - ${declaration.declarationDate}`,
      source: 'dividend_declaration',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, { status: 'declared', declarationJournalEntryId: entry.id });
  }

  /**
   * Pays the declared dividend: ONE balanced entry — DR Dividends
   * Payable (full gross `totalAmount`) / CR Cash and Bank
   * (`netPayableToShareholders`) / CR Dividends Tax Payable
   * (`dividendsTaxWithheld`). Rejects a non-declared record.
   */
  async pay(id: ID, paidDate?: string, postedByUserId?: ID): Promise<DividendDeclaration> {
    const declaration = await this.repository.getById(id);
    if (!declaration) {
      throw new Error(`Dividend declaration "${id}" not found.`);
    }
    if (declaration.status !== 'declared') {
      throw new Error(`Cannot pay dividend "${id}": only a declared dividend can be paid (current status: ${declaration.status}).`);
    }

    const date = paidDate ?? new Date().toISOString().slice(0, 10);

    const lines: NewJournalLineInput[] = [
      {
        accountId: DIVIDENDS_PAYABLE_ACCOUNT_ID,
        description: `Dividend paid - ${date}`,
        debit: declaration.totalAmount,
        credit: 0,
      },
      {
        accountId: CASH_AND_BANK_ACCOUNT_ID,
        description: `Dividend paid - ${date} - net to shareholders`,
        debit: 0,
        credit: declaration.netPayableToShareholders,
      },
      {
        accountId: DIVIDENDS_TAX_PAYABLE_ACCOUNT_ID,
        description: `Dividend paid - ${date} - Dividends Tax withheld`,
        debit: 0,
        credit: declaration.dividendsTaxWithheld,
      },
    ].filter((line) => line.debit > EPSILON || line.credit > EPSILON);

    const entry = await this.journalPoster.postJournalEntry({
      date,
      memo: `Dividend payment - ${date}`,
      source: 'dividend_payment',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, { status: 'paid', paymentJournalEntryId: entry.id, paidDate: date });
  }

  /**
   * Remits the withheld Dividends Tax to SARS: DR Dividends Tax Payable
   * / CR Cash and Bank for `dividendsTaxWithheld`. Models the
   * employer's actual remittance, real-world due by the end of the
   * month following the month the dividend was paid (see
   * `getRemittanceDueDateHint()`) — shown as an informational hint
   * only, never hard-blocked here, since this app has no real
   * date-of-submission enforcement elsewhere either. Rejects a
   * non-paid record.
   */
  async remitToSars(id: ID, remittedDate?: string, postedByUserId?: ID): Promise<DividendDeclaration> {
    const declaration = await this.repository.getById(id);
    if (!declaration) {
      throw new Error(`Dividend declaration "${id}" not found.`);
    }
    if (declaration.status !== 'paid') {
      throw new Error(`Cannot remit dividend "${id}": only a paid dividend can be remitted (current status: ${declaration.status}).`);
    }

    const date = remittedDate ?? new Date().toISOString().slice(0, 10);

    if (declaration.dividendsTaxWithheld <= EPSILON) {
      // Nothing was withheld (e.g. fully exempt) - nothing to remit; just
      // flip status without posting a zero-value/degenerate journal entry.
      return this.repository.update(id, { status: 'remitted', remittedDate: date });
    }

    const lines: NewJournalLineInput[] = [
      {
        accountId: DIVIDENDS_TAX_PAYABLE_ACCOUNT_ID,
        description: `Dividends Tax remitted to SARS - ${date}`,
        debit: declaration.dividendsTaxWithheld,
        credit: 0,
      },
      {
        accountId: CASH_AND_BANK_ACCOUNT_ID,
        description: `Dividends Tax remitted to SARS - ${date}`,
        debit: 0,
        credit: declaration.dividendsTaxWithheld,
      },
    ];

    const entry = await this.journalPoster.postJournalEntry({
      date,
      memo: `Dividends Tax remittance - ${date}`,
      source: 'dividend_tax_remittance',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, { status: 'remitted', remittanceJournalEntryId: entry.id, remittedDate: date });
  }
}

/**
 * Informational only (see remitToSars()'s doc comment) — real-world
 * practice: Dividends Tax withheld must be paid to SARS by the last day
 * of the month following the month in which the dividend was paid
 * (Income Tax Act s64K). Not enforced as a hard deadline anywhere in
 * this app.
 */
export function getRemittanceDueDateHint(paidDate: string): string {
  return endOfFollowingMonth(paidDate);
}
