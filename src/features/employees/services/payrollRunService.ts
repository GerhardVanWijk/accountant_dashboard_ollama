import type { Company, Employee, ID, PayrollRun, PayslipLine } from '@/types';
import type { IPayrollRunRepository } from '../repositories/IPayrollRunRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import type { PayrollTaxConfigService } from './payrollTaxConfigService';
import { computePayslipLine, type PayslipOverrideInput } from './payrollCalculations';
import type { PayrollRunPostingExecutor } from './payrollRunPostingExecutor';
import type { PayrollRunCorrectionExecutor } from './payrollRunCorrectionExecutor';
import type { PayrollSettlementExecutor, SettlePayrollNetPayResult } from './payrollSettlementExecutor';
import { newUuid } from '@/lib/uuid';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Minimal surface of EmployeeService this service depends on. */
export interface EmployeeStore {
  getActiveEmployees(): Promise<Employee[]>;
  getEmployee(id: ID): Promise<Employee | undefined>;
}

/** Minimal surface of CompanyService this service depends on, for Company.sdlExempt. */
export interface CompanyStore {
  getCompanies(): Promise<Company[]>;
}

/**
 * A reversed run is excluded from the overlap check — its period is freed
 * for a genuine correction re-run (Leases + Payroll integrity audit, PART
 * 2 "payroll correction/reversal workflow"), same scope as migration
 * 0091's `payroll_runs_no_overlapping_period` EXCLUDE constraint (`where
 * reversed_at is null`), which is the real, race-proof backstop this
 * app-level check exists alongside for a friendlier error message before
 * ever reaching the database.
 */
function overlaps(run: PayrollRun, start: string, end: string): boolean {
  if (run.reversedAt) return false;
  return run.payPeriodStart <= end && start <= run.payPeriodEnd;
}

function emptyTotals() {
  return { grossPay: 0, paye: 0, uifEmployee: 0, uifEmployer: 0, sdlEmployer: 0, deductionsTotal: 0, netPay: 0 };
}

function sumTotals(payslips: PayslipLine[]) {
  return payslips.reduce((acc, p) => {
    acc.grossPay += p.grossPay;
    acc.paye += p.paye;
    acc.uifEmployee += p.uifEmployee;
    acc.uifEmployer += p.uifEmployer;
    acc.sdlEmployer += p.sdlEmployer;
    acc.deductionsTotal += p.deductionsTotal;
    acc.netPay += p.netPay;
    return acc;
  }, emptyTotals());
}

/**
 * The payroll processing engine (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 8
 * "Payroll"). A run is created as 'draft' — every 'active' employee's
 * payslip line is computed up front via computePayslipLine() so it can be
 * reviewed/adjusted (overtime, bonus) before anything touches the GL — the
 * same create-draft-then-explicit-post pattern Bill/Invoice/FixedAsset use.
 * postPayrollRun() then posts ONE combined balanced journal entry for the
 * whole run, mirroring depreciationService.runDepreciation()'s
 * one-combined-entry-per-run design (many employees' lines collapsed into
 * one entry, still valid double-entry as long as debits=credits overall).
 */
export class PayrollRunService {
  constructor(
    private readonly repository: IPayrollRunRepository,
    private readonly employeeStore: EmployeeStore,
    private readonly taxConfigService: Pick<PayrollTaxConfigService, 'getConfigForDate'>,
    private readonly companyStore: CompanyStore,
    private readonly postingExecutor: PayrollRunPostingExecutor,
    private readonly accounts: AccountMapper,
    private readonly correctionExecutor: PayrollRunCorrectionExecutor,
    private readonly settlementExecutor: PayrollSettlementExecutor,
  ) {}

  async getPayrollRuns(): Promise<PayrollRun[]> {
    return this.repository.getAll();
  }

  async getPayrollRun(id: ID): Promise<PayrollRun | undefined> {
    return this.repository.getById(id);
  }

  private async resolveConfig(payDate: string) {
    const config = await this.taxConfigService.getConfigForDate(new Date(payDate));
    if (!config) {
      throw new Error(
        `No payroll tax configuration covers ${payDate} — add a PayrollTaxYearConfig for the relevant SARS tax year first.`,
      );
    }
    return config;
  }

  private async resolveSdlExempt(): Promise<boolean> {
    const companies = await this.companyStore.getCompanies();
    return companies[0]?.sdlExempt ?? false;
  }

  /**
   * Computes a new draft run for every currently-active employee.
   * Idempotency guard: rejects a pay period that overlaps ANY existing run
   * (draft or posted) — the same class of guard as
   * purchaseOrderService.recordReceipt()'s "reject an already-received PO"
   * and depreciationService's per-period-end check, applied here to
   * prevent double-paying a period rather than double-crediting it.
   */
  async createPayrollRun(
    payPeriodStart: string,
    payPeriodEnd: string,
    payDate: string,
    overrides: Record<ID, PayslipOverrideInput> = {},
  ): Promise<PayrollRun> {
    if (new Date(payPeriodEnd) < new Date(payPeriodStart)) {
      throw new Error('Pay period end date cannot be before its start date.');
    }

    const existingRuns = await this.repository.getAll();
    const overlap = existingRuns.find((r) => overlaps(r, payPeriodStart, payPeriodEnd));
    if (overlap) {
      throw new Error(`Payroll run "${overlap.runNumber}" already covers part of this pay period.`);
    }

    const employees = await this.employeeStore.getActiveEmployees();
    if (employees.length === 0) {
      throw new Error('No active employees to run payroll for.');
    }

    const config = await this.resolveConfig(payDate);
    const sdlExempt = await this.resolveSdlExempt();
    const asOf = new Date(payDate);

    const payslips = employees.map((employee) => computePayslipLine(employee, config, sdlExempt, asOf, overrides[employee.id]));

    const runNumber = await this.nextRunNumber();
    const now = new Date().toISOString();
    return this.repository.create({
      id: '',
      runNumber,
      payPeriodStart,
      payPeriodEnd,
      payDate,
      status: 'draft',
      payslips,
      // Statutory traceability (audit item 4): records WHICH tax-year
      // config actually computed these payslips, set once here and never
      // changed afterward — migration 0092 blocks that config from being
      // mutated once any run references it. Reproducing this run's figures
      // later never depends on getConfigForDate(payDate) still resolving
      // to the same config a later tax year's row might otherwise shadow.
      payrollTaxYearConfigId: config.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Recomputes one employee's line within a draft run (e.g. adding
   * overtime/a bonus for this period only) through the SAME
   * computePayslipLine() path createPayrollRun() used, so a run's numbers
   * are never hand-edited out of step with the calculation engine.
   */
  async updatePayslipOverride(runId: ID, employeeId: ID, overrides: PayslipOverrideInput): Promise<PayrollRun> {
    const run = await this.repository.getById(runId);
    if (!run) {
      throw new Error(`Payroll run "${runId}" not found.`);
    }
    if (run.status !== 'draft') {
      throw new Error(`Cannot edit payroll run "${run.runNumber}": it has already been posted.`);
    }
    const employee = await this.employeeStore.getEmployee(employeeId);
    if (!employee) {
      throw new Error(`Employee "${employeeId}" not found.`);
    }
    if (!run.payslips.some((p) => p.employeeId === employeeId)) {
      throw new Error(`Employee "${employeeId}" is not part of payroll run "${run.runNumber}".`);
    }

    const config = await this.resolveConfig(run.payDate);
    const sdlExempt = await this.resolveSdlExempt();
    const recomputed = computePayslipLine(employee, config, sdlExempt, new Date(run.payDate), overrides);

    const payslips = run.payslips.map((p) => (p.employeeId === employeeId ? recomputed : p));
    return this.repository.update(runId, { payslips });
  }

  /** Permanently removes a draft run. A posted run has real GL history behind it and must never be deleted (§14/§36/§72/§79), same rule as every other posted-document delete guard in this codebase. */
  async deletePayrollRun(id: ID): Promise<void> {
    const run = await this.repository.getById(id);
    if (!run) {
      throw new Error(`Payroll run "${id}" not found.`);
    }
    if (run.status !== 'draft') {
      throw new Error(`Cannot delete payroll run "${run.runNumber}": already posted.`);
    }
    return this.repository.delete(id);
  }

  /**
   * Posts one combined, balanced journal entry for the whole run:
   *   DR Salaries and Wages Expense       (sum of gross pay)
   *   DR Employer UIF Contribution Expense (sum of employer UIF)
   *   DR Employer SDL Contribution Expense (sum of SDL)
   *   CR PAYE Payable
   *   CR UIF Payable - Employee
   *   CR UIF Payable - Employer
   *   CR SDL Payable
   *   CR Other Payroll Deductions Payable  (pension/medical/garnishee etc.)
   *   CR contraAccountId                   (sum of net pay — Net Pay
   *                                          Payable; see below)
   * Balances by construction: computePayslipLine() defines each employee's
   * netPay as the exact remainder of grossPay after paye/uifEmployee/
   * deductions, so summed across the run, debits (gross + employer UIF +
   * SDL) always equal credits (paye + uifEmployee + uifEmployer + SDL +
   * deductions + netPay) — see payrollCalculations.ts's doc comment.
   *
   * `contraAccountId` MUST be a liability/clearing account (2250 Net Pay
   * Payable) — never Cash and Bank directly (Leases + Payroll integrity
   * audit, PART 3 Banking fix, enforced again server-side by
   * `post_payroll_run`, migration 0091). The real EFT disbursement is
   * recorded once, later, through the existing Banking module against
   * this same clearing account (`subledgerSettlementService.ts`) — posting
   * straight to Cash here would let that later import/allocation double-
   * count the same cash movement.
   *
   * Posts through `postingExecutor` — one atomic RPC call (`post_payroll_run`)
   * that posts the journal AND flips the run to 'posted' in the SAME
   * database transaction — a failure between the two independent writes
   * this replaced could leave a posted journal with the run still showing
   * 'draft', and a retry would double-post the whole run's salaries/UIF/
   * PAYE/SDL.
   */
  async postPayrollRun(id: ID, contraAccountId: ID, postedByUserId?: ID): Promise<PayrollRun> {
    const run = await this.repository.getById(id);
    if (!run) {
      throw new Error(`Payroll run "${id}" not found.`);
    }
    if (run.status !== 'draft') {
      throw new Error(`Payroll run "${run.runNumber}" has already been posted.`);
    }
    if (run.payslips.length === 0) {
      throw new Error(`Payroll run "${run.runNumber}" has no payslip lines to post.`);
    }

    const totals = sumTotals(run.payslips);
    const memo = `Payroll run ${run.runNumber} (${run.payPeriodStart} to ${run.payPeriodEnd})`;
    const [salariesExpenseId, uifEmployerExpenseId, sdlExpenseId, payePayableId, uifEmployeePayableId, uifEmployerPayableId, sdlPayableId, otherDeductionsPayableId] =
      await Promise.all([
        this.accounts.getAccountId('SALARIES_EXPENSE'),
        this.accounts.getAccountId('UIF_EMPLOYER_EXPENSE'),
        this.accounts.getAccountId('SDL_EXPENSE'),
        this.accounts.getAccountId('PAYE_PAYABLE'),
        this.accounts.getAccountId('UIF_EMPLOYEE_PAYABLE'),
        this.accounts.getAccountId('UIF_EMPLOYER_PAYABLE'),
        this.accounts.getAccountId('SDL_PAYABLE'),
        this.accounts.getAccountId('OTHER_DEDUCTIONS_PAYABLE'),
      ]);
    const lines: NewJournalLineInput[] = [];

    if (totals.grossPay > 0) lines.push({ accountId: salariesExpenseId, description: memo, debit: round2(totals.grossPay), credit: 0 });
    if (totals.uifEmployer > 0) lines.push({ accountId: uifEmployerExpenseId, description: memo, debit: round2(totals.uifEmployer), credit: 0 });
    if (totals.sdlEmployer > 0) lines.push({ accountId: sdlExpenseId, description: memo, debit: round2(totals.sdlEmployer), credit: 0 });
    if (totals.paye > 0) lines.push({ accountId: payePayableId, description: memo, debit: 0, credit: round2(totals.paye) });
    if (totals.uifEmployee > 0) lines.push({ accountId: uifEmployeePayableId, description: memo, debit: 0, credit: round2(totals.uifEmployee) });
    if (totals.uifEmployer > 0) lines.push({ accountId: uifEmployerPayableId, description: memo, debit: 0, credit: round2(totals.uifEmployer) });
    if (totals.sdlEmployer > 0) lines.push({ accountId: sdlPayableId, description: memo, debit: 0, credit: round2(totals.sdlEmployer) });
    if (totals.deductionsTotal > 0) lines.push({ accountId: otherDeductionsPayableId, description: memo, debit: 0, credit: round2(totals.deductionsTotal) });
    if (totals.netPay > 0) lines.push({ accountId: contraAccountId, description: memo, debit: 0, credit: round2(totals.netPay) });

    const result = await this.postingExecutor.postRun({
      payrollRunId: id,
      payDate: run.payDate,
      memo,
      source: 'payroll',
      lines,
      contraAccountId,
      createdBy: postedByUserId,
    });

    return result.run;
  }

  /**
   * The supported payroll-owned correction/reversal workflow (audit item
   * 5) — the pairing `journalEntryService.ts`'s generic block of a
   * `source: 'payroll'` reversal was always missing. Posts the EXACT
   * mathematical inverse of the original journal's own lines (derived from
   * `journal_lines` itself, not recomputed from payslips) as a new
   * `source: 'payroll_correction'` journal, and marks this run reversed —
   * never deletes or mutates its `payslips`/`journalEntryId`/`status`. Both
   * the original journal and the reversal remain on the books permanently.
   *
   * A genuinely corrected run for the now-freed pay period is just a
   * normal new `createPayrollRun()` call — no second "correction run"
   * concept exists.
   */
  async reversePayrollRun(id: ID, reason: string, reversalDate: string, reversedByUserId?: ID): Promise<PayrollRun> {
    if (!reason || reason.trim() === '') {
      throw new Error('A reason is required to reverse a posted payroll run.');
    }
    const run = await this.repository.getById(id);
    if (!run) {
      throw new Error(`Payroll run "${id}" not found.`);
    }
    if (run.status !== 'posted') {
      throw new Error(`Payroll run "${run.runNumber}" is not posted (status: ${run.status}) — only a posted run can be reversed.`);
    }
    if (run.reversedAt) {
      throw new Error(`Payroll run "${run.runNumber}" has already been reversed.`);
    }

    const result = await this.correctionExecutor.postCorrection({
      correctionId: newUuid(),
      payrollRunId: id,
      reversalDate,
      reason,
      createdBy: reversedByUserId,
    });

    return result.run;
  }

  /**
   * Records the real cash movement that clears (part of) a posted run's
   * Net Pay Payable balance — FINAL PRE-MIGRATION HARDENING, PART A. Posts
   * through `settlementExecutor` — one atomic RPC call
   * (`settle_payroll_net_pay`, migration 0096) that derives the
   * authoritative outstanding balance from the run's own posted journal
   * and every settlement already recorded, and refuses an amount that
   * would exceed it, ENTIRELY at the database layer — not merely in this
   * method or the calling form. A frontend-computed "outstanding" is never
   * trusted; only `amount` is passed through, and the RPC recomputes and
   * validates it itself under a row lock, so two concurrent callers (two
   * tabs, a retried request) can never together over-settle the same run.
   */
  async settleNetPay(id: ID, input: { bankAccountId: ID; date: string; amount: number; description?: string; reference?: string; settledByUserId?: ID }): Promise<SettlePayrollNetPayResult> {
    return this.settlementExecutor.settle({
      settlementId: newUuid(),
      payrollRunId: id,
      bankAccountId: input.bankAccountId,
      date: input.date,
      description: input.description,
      reference: input.reference,
      amount: input.amount,
      createdBy: input.settledByUserId,
    });
  }

  private async nextRunNumber(): Promise<string> {
    const runs = await this.repository.getAll();
    return `PR-${String(runs.length + 1).padStart(4, '0')}`;
  }
}
