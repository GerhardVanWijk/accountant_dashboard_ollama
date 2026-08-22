import type { BaseEntity, ID, ISODateString } from './common';

/**
 * Effective-dated Dividends Withholding Tax rate configuration
 * (SA_ACCOUNTING_MASTER_SPEC.md §56). A create-only, rarely-changing
 * statutory rate — mirrors PayrollTaxYearConfig's lightweight
 * create-only pattern (see payrollTaxConfigService.ts's doc comment)
 * rather than TaxRateService's full supersede()-with-audit-trail
 * engine: Dividends Tax has had exactly one rate (20%) since 22
 * February 2017, republished wholesale by SARS/National Treasury when
 * (rarely) it changes, not superseded piecemeal by a company's own
 * business decision. Resolved by effective date via
 * DividendsWithholdingTaxConfigService.getRateForDate() — the newest
 * record whose `effectiveFrom` is on or before the date in question.
 */
export interface DividendsWithholdingTaxRateConfig extends BaseEntity {
  /** Percentage value, e.g. 20 for 20%. */
  ratePercent: number;
  effectiveFrom: ISODateString;
  /**
   * Legal/authoritative reference for this rate — SA_ACCOUNTING_MASTER_SPEC.md
   * §109/§110: every rate must be traceable to a source, and anything not
   * independently verified must say so rather than being presented as
   * confirmed.
   */
  sourceReference: string;
}

export type DividendDeclarationStatus = 'draft' | 'declared' | 'paid' | 'remitted';

/**
 * One dividend's declaration/payment/remittance lifecycle
 * (SA_ACCOUNTING_MASTER_SPEC.md §56: "dividend declaration", "dividend
 * payment", "dividend withholding tax", "exemptions where applicable",
 * "dividend tax calculations", "payment dates"). Gross, company-wide
 * only — this codebase has NO shareholder register anywhere (see
 * docs/SA_SPEC_GAP_ANALYSIS.md), so §56's "shareholder allocation" line
 * item is a documented, out-of-scope gap here: nothing in this type or
 * its service allocates `totalAmount` across individual shareholders,
 * or tracks any shareholder's individual residency/exemption status.
 *
 * `exemptPortion`/`exemptionReason` model a manual override AMOUNT the
 * preparer enters (e.g. because some shareholders are SA resident
 * companies exempt from the withholding under s64F, or another s64F/
 * s64FA exemption applies) — this is NOT computed from any shareholder
 * eligibility data, because none exists in this system. The reason is
 * mandatory whenever `exemptPortion > 0`, mirroring
 * TaxRateService.supersede()'s reason-required-override pattern, so the
 * override is auditable rather than a silent guess.
 *
 * Status flow: draft -> declared -> paid -> remitted, with exactly one
 * journal entry posted per transition (declare/pay/remitToSars) —
 * three journal entries across a dividend's full lifecycle, matching
 * this codebase's "GL posts, then status flips" ordering (see
 * BillService.postBill(), PurchaseOrderService.recordReceipt()).
 */
export interface DividendDeclaration extends BaseEntity {
  declarationDate: ISODateString;
  /** Gross dividend declared, before any withholding. */
  totalAmount: number;
  /** Manual override amount exempt from Dividends Tax withholding. Requires `exemptionReason` when > 0. Defaults to 0. */
  exemptPortion: number;
  exemptionReason?: string;
  status: DividendDeclarationStatus;
  /** totalAmount - exemptPortion. Recomputed whenever totalAmount/exemptPortion/declarationDate change while still a draft. */
  taxableAmount: number;
  /** The Dividends Withholding Tax rate (%) resolved as of `declarationDate` and applied to `taxableAmount`. */
  ratePercentApplied: number;
  /** taxableAmount * ratePercentApplied / 100, rounded to cents. */
  dividendsTaxWithheld: number;
  /** totalAmount - dividendsTaxWithheld — what shareholders actually receive in cash. */
  netPayableToShareholders: number;
  /** JournalEntry id from declare(): DR Retained Earnings (acc_3900) / CR Dividends Payable (acc_2500) for totalAmount. */
  declarationJournalEntryId?: ID;
  /** JournalEntry id from pay(): DR Dividends Payable (acc_2500) totalAmount / CR Cash and Bank (acc_1000) netPayableToShareholders / CR Dividends Tax Payable (acc_2510) dividendsTaxWithheld. */
  paymentJournalEntryId?: ID;
  paidDate?: ISODateString;
  /** JournalEntry id from remitToSars(): DR Dividends Tax Payable (acc_2510) / CR Cash and Bank (acc_1000) for dividendsTaxWithheld. */
  remittanceJournalEntryId?: ID;
  remittedDate?: ISODateString;
  notes?: string;
}
