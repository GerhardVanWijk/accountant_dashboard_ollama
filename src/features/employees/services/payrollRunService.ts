import type { Company, Employee, ID, JournalEntry, PayrollRun, PayslipLine } from '@/types';
import type { IPayrollRunRepository } from '../repositories/IPayrollRunRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';
import type { PayrollTaxConfigService } from './payrollTaxConfigService';
import { computePayslipLine, type PayslipOverrideInput } from './payrollCalculations';

const SALARIES_EXPENSE_ACCOUNT_ID = 'acc_5400';
const UIF_EMPLOYER_EXPENSE_ACCOUNT_ID = 'acc_5410';
const SDL_EXPENSE_ACCOUNT_ID = 'acc_5420';
const PAYE_PAYABLE_ACCOUNT_ID = 'acc_2200';
const UIF_EMPLOYEE_PAYABLE_ACCOUNT_ID = 'acc_2210';
const UIF_EMPLOYER_PAYABLE_ACCOUNT_ID = 'acc_2220';
const SDL_PAYABLE_ACCOUNT_ID = 'acc_2230';
const OTHER_DEDUCTIONS_PAYABLE_ACCOUNT_ID = 'acc_2240';

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

/** Minimal surface of EmployeeService this service depends on. */
export interface EmployeeStore {
  getActiveEmployees(): Promise<Employee[]>;
  getEmployee(id: ID): Promise<Employee | undefined>;
}

/** Minimal surface of CompanyService this service depends on, for Company.sdlExempt. */
export interface CompanyStore {
  getCompanies(): Promise<Company[]>;
}

function overlaps(run: PayrollRun, start: string, end: string): boolean {
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
    private readonly journalPoster: JournalPoster,
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
   *   CR contraAccountId                   (sum of net pay — Cash and Bank
   *                                          if paid immediately, or Net
   *                                          Pay Payable if disbursed later)
   * Balances by construction: computePayslipLine() defines each employee's
   * netPay as the exact remainder of grossPay after paye/uifEmployee/
   * deductions, so summed across the run, debits (gross + employer UIF +
   * SDL) always equal credits (paye + uifEmployee + uifEmployer + SDL +
   * deductions + netPay) — see payrollCalculations.ts's doc comment.
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
    const lines: NewJournalLineInput[] = [];

    if (totals.grossPay > 0) lines.push({ accountId: SALARIES_EXPENSE_ACCOUNT_ID, description: memo, debit: round2(totals.grossPay), credit: 0 });
    if (totals.uifEmployer > 0) lines.push({ accountId: UIF_EMPLOYER_EXPENSE_ACCOUNT_ID, description: memo, debit: round2(totals.uifEmployer), credit: 0 });
    if (totals.sdlEmployer > 0) lines.push({ accountId: SDL_EXPENSE_ACCOUNT_ID, description: memo, debit: round2(totals.sdlEmployer), credit: 0 });
    if (totals.paye > 0) lines.push({ accountId: PAYE_PAYABLE_ACCOUNT_ID, description: memo, debit: 0, credit: round2(totals.paye) });
    if (totals.uifEmployee > 0) lines.push({ accountId: UIF_EMPLOYEE_PAYABLE_ACCOUNT_ID, description: memo, debit: 0, credit: round2(totals.uifEmployee) });
    if (totals.uifEmployer > 0) lines.push({ accountId: UIF_EMPLOYER_PAYABLE_ACCOUNT_ID, description: memo, debit: 0, credit: round2(totals.uifEmployer) });
    if (totals.sdlEmployer > 0) lines.push({ accountId: SDL_PAYABLE_ACCOUNT_ID, description: memo, debit: 0, credit: round2(totals.sdlEmployer) });
    if (totals.deductionsTotal > 0) lines.push({ accountId: OTHER_DEDUCTIONS_PAYABLE_ACCOUNT_ID, description: memo, debit: 0, credit: round2(totals.deductionsTotal) });
    if (totals.netPay > 0) lines.push({ accountId: contraAccountId, description: memo, debit: 0, credit: round2(totals.netPay) });

    const entry = await this.journalPoster.postJournalEntry({
      date: run.payDate,
      memo,
      source: 'payroll',
      lines,
      postedByUserId,
    });

    return this.repository.update(id, { status: 'posted', journalEntryId: entry.id, contraAccountId });
  }

  private async nextRunNumber(): Promise<string> {
    const runs = await this.repository.getAll();
    return `PR-${String(runs.length + 1).padStart(4, '0')}`;
  }
}
