import type { BaseEntity, ID, ISODateString } from './common';

/**
 * South African provisional tax (SA_ACCOUNTING_MASTER_SPEC.md §54 — Phase 9
 * "Tax", Wave 2, built once the Income Tax engine — §51/§52/§53,
 * src/features/tax/incomeTax/ — existed). Provisional tax is an early
 * payment AGAINST the same year-end Income Tax liability, not a separate
 * tax: every estimate here is computed by reusing
 * calculateTaxLiability()/IncomeTaxYearConfig from the Income Tax module
 * (never a second bracket/flat-rate implementation), and every payment
 * posts against the SAME Income Tax Payable control account (acc_2300)
 * TaxComputationService.postComputation() eventually credits — see
 * ProvisionalTaxService's class doc comment for why no new GL account was
 * introduced.
 */

/** Which of the three possible provisional tax payments a slot represents. §54: "first provisional payment", "second provisional payment", "top-up/third payment where applicable". */
export type ProvisionalPaymentSlotName = 'first' | 'second' | 'topUp';

/**
 * One payment slot's lifecycle: due date is always known (computed by
 * calculateProvisionalTaxDueDates() the moment the period is created);
 * estimatedTaxableIncome/estimatedTaxLiability are set once an estimate is
 * recorded (ProvisionalTaxService.recordEstimate()); amountPaid/paidDate/
 * journalEntryId are set only once the slot is actually paid
 * (ProvisionalTaxService.payProvisionalTax()). A slot with a due date but no
 * estimate, or an estimate but no payment, is a valid intermediate state —
 * "draft/estimated but unpaid" is not an error.
 */
export interface ProvisionalPaymentSlot {
  dueDate: ISODateString;
  /** Estimated taxable income for the year to date, as entered by the user. */
  estimatedTaxableIncome?: number;
  /** calculateTaxLiability(estimatedTaxableIncome, company.isSbcEligible, the resolved IncomeTaxYearConfig) — never computed a second way. */
  estimatedTaxLiability?: number;
  /** The amount actually paid — may differ from estimatedTaxLiability (e.g. a top-up payment covering a shortfall). */
  amountPaid?: number;
  paidDate?: ISODateString;
  /** Set once payProvisionalTax() posts DR Income Tax Payable (acc_2300) / CR Cash and Bank (acc_1000) for this slot. */
  journalEntryId?: ID;
}

/**
 * One company FinancialYear's provisional tax record, holding all three
 * possible payment slots together (NOT three separate top-level records)
 * since they share one estimate lifecycle and one reconciliation view
 * (§54's "reconciliation"). Exactly one ProvisionalTaxPeriod exists per
 * financial year — see ProvisionalTaxService.getOrCreatePeriod()'s
 * idempotency guard.
 */
export interface ProvisionalTaxPeriod extends BaseEntity {
  companyId: ID;
  financialYearId: ID;
  /** Denormalized at creation time for display, e.g. "FY2026" — mirrors TaxComputation.financialYearLabel's denormalization rationale. */
  financialYearLabel: string;
  /** Due 6 calendar months after the financial year START (the midpoint of the year). */
  first: ProvisionalPaymentSlot;
  /** Due on the financial year END date itself. */
  second: ProvisionalPaymentSlot;
  /** Voluntary, due 6 calendar months after the financial year END date. */
  topUp: ProvisionalPaymentSlot;
}

/**
 * §54's reconciliation read model — NOT persisted, computed on demand by
 * ProvisionalTaxService.getReconciliation() by diffing numbers that already
 * exist elsewhere (the sum of actually-paid slot amounts, and the final
 * POSTED TaxComputation.taxLiability for the same financial year, once one
 * exists). `finalTaxLiability`/`variance` stay undefined until a posted
 * TaxComputation exists for the financial year.
 *
 * Deliberately excludes any underpayment INTEREST/penalty figure (§110 "no
 * unsupported claims"): SARS's provisional-tax underpayment interest rate
 * floats with the prevailing repo rate rather than being a fixed statutory
 * figure the way VAT/PAYE/Dividends rates are seeded in this codebase —
 * computing it correctly requires the current SARS-published rate, out of
 * scope here. `variance` is a plain Rand-value gap only.
 */
export interface ProvisionalTaxReconciliation {
  financialYearId: ID;
  /** Sum of every slot's amountPaid where a payment has actually been recorded. */
  totalPaid: number;
  /** The final POSTED TaxComputation's taxLiability for this financial year, once one exists. */
  finalTaxLiability?: number;
  /** finalTaxLiability - totalPaid. Positive = still owed to SARS; negative = an overpayment/refund position. Undefined until finalTaxLiability exists. */
  variance?: number;
}
