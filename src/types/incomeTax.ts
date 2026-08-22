import type { BaseEntity, ID, ISODateString } from './common';

/**
 * South African corporate income tax (SA_ACCOUNTING_MASTER_SPEC.md §51/§52/
 * §53 — Phase 9 "Tax"). Deliberately excludes Deferred Tax (§50, Phase 12)
 * and taxable Capital Gains Tax computation (§55, a parallel "capital
 * gains" module not yet wired in) — see TaxAdjustmentCategory's
 * 'recoupment_or_capital_gain' doc comment and TaxComputation's doc
 * comment for exactly where those boundaries sit.
 */

/**
 * One bracket of the SBC (Small Business Corporation) progressive tax
 * table (§53). `appliesAboveAmount` is stored explicitly (SARS publishes
 * it as "on amount above R99,000" style wording) rather than derived from
 * `lowerBound - 1`, to avoid an off-by-one bug and to match the source
 * table exactly, field for field.
 */
export interface SbcTaxBracket {
  /** Inclusive lower bound of taxable income this bracket covers. */
  lowerBound: number;
  /** Inclusive upper bound; null for the top, unbounded bracket. */
  upperBound: number | null;
  /** The amount the marginal rate is calculated above ("... on amount above R99,000"). */
  appliesAboveAmount: number;
  /** Fixed base amount owed once taxable income reaches appliesAboveAmount (SARS's "R18,620 +" style base). */
  baseAmount: number;
  marginalRatePercent: number;
}

/**
 * One SARS tax year's corporate income tax configuration — the flat
 * corporate rate (§52) AND the SBC bracket table (§53) bundled into a
 * single effective-dated record, mirroring PayrollTaxYearConfig
 * (src/types/payroll.ts) bundling PAYE/UIF/SDL into one per-year record:
 * SARS publishes both tables together, for the same year of assessment,
 * on the same page, so two separately-versioned config types that could
 * end up with disagreeing effective-date windows would be a real risk for
 * no real benefit. `effectiveFrom`/`effectiveTo` describe the window of
 * FINANCIAL YEAR END dates this config applies to (SARS phrases the
 * corporate rate as "for years of assessment ending [date] – [date]"), not
 * a calendar window a transaction date falls into — resolve it against
 * the company's FinancialYear.endDate, never getSarsTaxYear() (that is the
 * unrelated 1 March–end-Feb individual/PAYE withholding year, see
 * src/features/employees/utils/sarsTaxYear.ts's doc comment).
 */
export interface IncomeTaxYearConfig extends BaseEntity {
  /** e.g. "2026/2027". */
  taxYearLabel: string;
  effectiveFrom: ISODateString;
  effectiveTo: ISODateString;
  /** Flat rate (§52) — applies unless the company is a manually-flagged SBC (Company.isSbcEligible). */
  corporateTaxRatePercent: number;
  /** Progressive brackets (§53) — applies only when Company.isSbcEligible is true. Ascending by lowerBound, last entry's upperBound is null. */
  sbcBrackets: SbcTaxBracket[];
  sourceReference: string;
}

/**
 * §51's list of supported tax-reconciliation adjustment categories.
 * 'wear_and_tear_allowance'/'depreciation_addback' are the pre-filled,
 * user-editable pair described in TaxComputation's doc comment.
 * 'disposal_gain_loss_addback' is auto-suggested per fixed-asset disposal
 * in the period (removing the ACCOUNTING gain/loss from taxable income).
 * 'recoupment_or_capital_gain' is a placeholder line the user fills in by
 * hand for now: the REAL taxable recoupment/capital gain computation is
 * §55 scope, owned by a separate capital-gains module
 * (src/features/tax/capitalGains/, not yet built as of this pass) — see
 * docs/KNOWN_ISSUES.md.
 */
export type TaxAdjustmentCategory =
  | 'non_deductible_expense'
  | 'exempt_income'
  | 'wear_and_tear_allowance'
  | 'depreciation_addback'
  | 'disposal_gain_loss_addback'
  | 'recoupment_or_capital_gain'
  | 'donations'
  | 'entertainment'
  | 'penalties'
  | 'provisions'
  | 'bad_debts'
  | 'interest_limitation'
  | 'assessed_loss_brought_forward'
  | 'other';

/** Whether an adjustment line increases ('add') or decreases ('subtract') taxable income relative to accounting profit. */
export type TaxAdjustmentDirection = 'add' | 'subtract';

/**
 * A single reconciliation line between accounting profit and taxable
 * income. `amount` is always a non-negative magnitude — `direction`
 * carries the sign, so a UI can render "+"/"-" explicitly rather than
 * relying on a signed number alone (docs/DO_NOT_BREAK.md's Financial UI
 * Patterns: "Omit `+` prefix on positive values" is a similar
 * accessibility rule this mirrors). Embedded directly on TaxComputation,
 * the same "array embedded on the parent record" pattern PayslipLine uses
 * on PayrollRun rather than a separate normalized table.
 */
export interface TaxAdjustment {
  /** Client-side/editing key only — not a persisted entity id of its own. */
  id: string;
  category: TaxAdjustmentCategory;
  description: string;
  amount: number;
  direction: TaxAdjustmentDirection;
}

export type TaxComputationStatus = 'draft' | 'posted';

/**
 * One company FinancialYear's corporate income tax computation
 * (§51/§52/§53) — the accounting-profit-to-taxable-income reconciliation,
 * draft-then-post lifecycle matching every other posting module in this
 * codebase (Bill/Invoice/FixedAsset/PayrollRun). `accountingProfit` and
 * the initial `adjustments` are computed by
 * TaxComputationService.createComputation() up front (mirroring
 * PayrollRunService.createPayrollRun()'s "compute up front, review/edit
 * before posting" pattern) but every adjustment line stays user-editable
 * while status is 'draft' — §111 "professional review required": this is
 * guidance, not gospel. `isSbcEligible`/`taxConfigId` are SNAPSHOTS taken
 * at computation time, so a later change to Company.isSbcEligible or a new
 * IncomeTaxYearConfig never silently rewrites a computation already in
 * progress or posted.
 *
 * Deliberately NOT implemented here (see docs/SA_SPEC_GAP_ANALYSIS.md /
 * docs/KNOWN_ISSUES.md for the full list): Deferred Tax (§50, Phase 12);
 * the real taxable capital gain computation behind
 * 'recoupment_or_capital_gain' (§55, a parallel capital-gains module);
 * Provisional Tax (§54); a reversal/correction path for a posted
 * computation (posting is currently a one-way door, same open gap
 * PayrollRun's postPayrollRun() and DepreciationService's runDepreciation()
 * also leave open).
 */
export interface TaxComputation extends BaseEntity {
  companyId: ID;
  financialYearId: ID;
  /** Denormalized at computation time for display, e.g. "FY2026" — mirrors PayslipLine.employeeName's denormalization rationale. */
  financialYearLabel: string;
  status: TaxComputationStatus;
  /** sum(revenue-type net movement) - sum(expense-type net movement) over the financial year's posted GL activity. */
  accountingProfit: number;
  /** Snapshot of Company.isSbcEligible at computation time. */
  isSbcEligible: boolean;
  adjustments: TaxAdjustment[];
  /** accountingProfit + sum(adjustments, signed by direction). */
  taxableIncome: number;
  /** Which IncomeTaxYearConfig's effective-date window covered this financial year's end date. */
  taxConfigId: ID;
  taxConfigTaxYearLabel: string;
  /** Computed via the SBC bracket table (isSbcEligible) or the flat corporate rate otherwise. */
  taxLiability: number;
  /**
   * Set only once postComputation() succeeds AND taxLiability > 0 — a
   * zero-liability year (e.g. an SBC-eligible company with taxable income
   * fully inside the 0% band, or an assessed loss) has nothing to post to
   * the GL, so status still moves to 'posted' but no journal entry exists,
   * mirroring DepreciationRunResult.journalEntryId's "undefined means
   * nothing was posted" convention.
   */
  journalEntryId?: ID;
  postedAt?: ISODateString;
  postedByUserId?: ID;
}
