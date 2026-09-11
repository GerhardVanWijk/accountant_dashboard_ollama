import type { BaseEntity, ID, ISODateString } from './common';

/**
 * One annual PAYE tax bracket in SARS's official cumulative "base + rate%
 * of the amount over the bracket's lower bound" presentation. `upTo` is
 * this bracket's upper bound of ANNUAL taxable income; `null` marks the
 * top, unbounded bracket. `base` is the cumulative tax already due at the
 * bracket's lower bound (i.e. the upper bound of the previous bracket).
 */
export interface PayeBracket {
  upTo: number | null;
  /** Percentage, e.g. 18 for 18%. */
  rate: number;
  base: number;
}

/**
 * One SARS tax year's payroll statutory configuration — effective-dated by
 * `taxYearStart`/`taxYearEnd` (SA_ACCOUNTING_MASTER_SPEC.md §59: the SARS
 * tax year, 1 March to end-February, is explicitly NOT the same calendar as
 * this company's accounting FinancialYear, and the system must understand
 * both). `payrollTaxConfigService.getConfigForDate()` resolves which
 * version applies to a given pay date, mirroring
 * `TaxRateService.getEffectiveRate()`'s effective-dated lookup.
 *
 * IMPORTANT — VERIFICATION CAVEAT: this type carries the SAME caution as
 * `TaxRate.sourceReference` and `FixedAsset.taxWearTearRateSource`
 * (SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — `sourceReference` on every
 * record must say where its figures came from and whether they've been
 * checked, never present a number as confirmed without saying so. The
 * current seed record (src/mock-data/payrollTaxConfig.ts) WAS verified
 * 2026-08-22 directly against live sars.gov.za pages (cited per-field in
 * that file) — an earlier placeholder version, reconstructed from general
 * training knowledge and not checked against any source, was replaced;
 * see docs/KNOWN_ISSUES.md's Resolved section for that history. Any
 * FUTURE tax year's config added here must repeat that same verification
 * against the current official SARS Tax Guide/Government Gazette before
 * being trusted for real payroll — a prior year having been verified is
 * not evidence the next one has been.
 */
export interface PayrollTaxYearConfig extends BaseEntity {
  /** e.g. "2024/2025". */
  taxYearLabel: string;
  taxYearStart: ISODateString;
  taxYearEnd: ISODateString;
  /** Ascending by upTo, last entry's upTo is null. */
  payeBrackets: PayeBracket[];
  primaryRebateAnnual: number;
  /** Additional annual rebate for an employee aged 65 or over. */
  secondaryRebateAnnual: number;
  /** Additional annual rebate (on top of primary+secondary) for an employee aged 75 or over. */
  tertiaryRebateAnnual: number;
  uifEmployeeRatePercent: number;
  uifEmployerRatePercent: number;
  /** Monthly remuneration ceiling UIF contributions are capped against, pro-rated to other pay frequencies. */
  uifMonthlyCeiling: number;
  sdlRatePercent: number;
  /** Below this ANNUAL leviable payroll, an employer is SDL-exempt. Applied here as a whole-company flag (Company.sdlExempt) rather than a real trailing-12-month payroll projection — see docs/SA_SPEC_GAP_ANALYSIS.md. */
  sdlAnnualPayrollExemptionThreshold: number;
  sourceReference: string;
}

/**
 * One employee's computed pay for a single PayrollRun — embedded in
 * `PayrollRun.payslips`, mirroring how `JournalEntry.lines` embeds its
 * lines rather than being a separate normalized table. Produced by
 * `computePayslipLine()` (src/features/employees/services/payrollCalculations.ts),
 * the ONE calculation path shared by run-creation, per-line editing, and
 * (eventually) any preview UI — same "one shared calc, never two
 * implementations to drift apart" principle as
 * `depreciationService.calculateMonthlyDepreciation()` /
 * `stockLotService.previewFifoCost()`.
 */
export interface PayslipLine {
  employeeId: ID;
  /** Denormalized at computation time so a payslip still reads correctly even if the employee record changes later. */
  employeeNumber: string;
  employeeName: string;
  basicSalary: number;
  overtime: number;
  bonus: number;
  allowancesTotal: number;
  /** basicSalary + overtime + bonus + allowancesTotal. */
  grossPay: number;
  /** PAYE-taxable portion of grossPay: excludes non-taxable allowances, less pre-tax deductions. */
  payeTaxableIncome: number;
  paye: number;
  uifEmployee: number;
  uifEmployer: number;
  sdlEmployer: number;
  /** Sum of every standardDeduction (both pre-tax and post-tax) actually withheld this period. */
  deductionsTotal: number;
  /** grossPay - paye - uifEmployee - deductionsTotal, computed as the exact remainder (never independently rounded) so a run's combined journal entry balances by construction. */
  netPay: number;
}

/**
 * 'draft': computed but not yet posted to the GL — freely editable
 * (payrollRunService.updatePayslipOverride()), mirrors Bill/Invoice/
 * FixedAsset's draft-then-post lifecycle.
 * 'posted': the combined journal entry has been posted; immutable from here.
 */
export type PayrollRunStatus = 'draft' | 'posted';

/**
 * One payroll run for one pay period, covering every 'active' employee at
 * the time the run was created (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 8
 * "Payroll"). `postPayrollRun()` posts ONE combined journal entry for the
 * whole run (many employees' lines collapsed into one balanced entry),
 * mirroring `depreciationService.runDepreciation()`'s one-combined-entry-
 * per-run design.
 */
export interface PayrollRun extends BaseEntity {
  runNumber: string;
  payPeriodStart: ISODateString;
  payPeriodEnd: ISODateString;
  payDate: ISODateString;
  status: PayrollRunStatus;
  payslips: PayslipLine[];
  journalEntryId?: ID;
  /**
   * The clearing/payable account net pay was credited to at posting —
   * Net Pay Payable (2250). Must be a liability account, enforced by
   * `post_payroll_run` (migration 0091): net pay is settled later, exactly
   * once, through the existing Banking module against this same account
   * (`subledgerSettlementService.ts`) — never Cash and Bank directly, which
   * would let the real EFT disbursement double-count the same cash
   * movement. Set only once posted.
   */
  contraAccountId?: ID;
  /**
   * Which `PayrollTaxYearConfig` actually computed this run's payslips —
   * set once, at creation time, never changed afterward (Leases + Payroll
   * integrity audit, PART 2 "statutory governance"). Lets a historical
   * run's figures be reproduced/verified even after a later tax year's
   * config has superseded it as `getConfigForDate()`'s current answer.
   * Migration 0092 blocks that referenced config from ever being mutated.
   */
  payrollTaxYearConfigId?: ID;
  /**
   * Reversal evidence (Leases + Payroll integrity audit, PART 2 "payroll
   * correction/reversal workflow", migration 0093). Set together, once,
   * by `PayrollRunService.reversePayrollRun()` — the ONLY supported way to
   * correct a posted run. `status` deliberately stays 'posted': the run
   * WAS posted and its original journal is still on the books, unchanged
   * — a reversal is a NEW contra journal, never a deletion/mutation of
   * the original (SA_ACCOUNTING_MASTER_SPEC.md's immutable-history
   * discipline). Undefined means never reversed.
   */
  reversedAt?: ISODateString;
  reversalJournalEntryId?: ID;
  reversalReason?: string;
  reversedBy?: ID;
}
