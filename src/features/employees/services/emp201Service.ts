import type { ID, ISODateString, PayrollRun } from '@/types';
import type { JournalEntryService } from '@/features/accounting/services/journalEntryService';

const PAYE_ACCOUNT_ID = 'acc_2200';
const UIF_EMPLOYEE_ACCOUNT_ID = 'acc_2210';
const UIF_EMPLOYER_ACCOUNT_ID = 'acc_2220';
const SDL_ACCOUNT_ID = 'acc_2230';

/** Half a rand — tolerance for floating-point rounding, not a real discrepancy (mirrors vatReportService.ts). */
const VARIANCE_EPSILON = 0.005;

function inPeriod(dateIso: ISODateString, periodStart: Date, periodEnd: Date): boolean {
  const d = new Date(dateIso);
  return d >= periodStart && d <= periodEnd;
}

/**
 * A monthly EMP201-shaped statutory payroll return (SA_ACCOUNTING_MASTER_SPEC.md
 * §57/§58/§60/§116 Phase 8). Deliberately NOT labelled with official SARS
 * EMP201 field/box numbers — this codebase has not independently verified
 * the exact current EMP201 form layout against SARS, same caution
 * vatReportService.ts documents for VAT201 (§110/§111). Presents PAYE/UIF/
 * SDL totals by category instead of claiming an official form mapping it
 * hasn't verified.
 */
export interface Emp201Report {
  periodStart: ISODateString;
  periodEnd: ISODateString;
  paye: number;
  uifEmployee: number;
  uifEmployer: number;
  totalUif: number;
  sdl: number;
  /** PAYE + total UIF + SDL — the amount owed to SARS for the period (§60). */
  statutoryLiability: number;
  employeeCount: number;
  runCount: number;
}

/**
 * Computes the statutory payroll liability for one period from real,
 * POSTED PayrollRuns only — no run is re-calculated here, every payslip
 * line's already-computed paye/uifEmployee/uifEmployer/sdlEmployer is
 * simply summed (same "never derive a report from recomputed numbers"
 * principle as computeVatReport()). A run groups by its `payDate`, not its
 * pay period, matching when the statutory liability is actually incurred.
 */
export function computeEmp201Report(periodStart: Date, periodEnd: Date, runs: PayrollRun[]): Emp201Report {
  const posted = runs.filter((r) => r.status === 'posted' && inPeriod(r.payDate, periodStart, periodEnd));

  let paye = 0;
  let uifEmployee = 0;
  let uifEmployer = 0;
  let sdl = 0;
  const employeeIds = new Set<ID>();

  for (const run of posted) {
    for (const line of run.payslips) {
      paye += line.paye;
      uifEmployee += line.uifEmployee;
      uifEmployer += line.uifEmployer;
      sdl += line.sdlEmployer;
      employeeIds.add(line.employeeId);
    }
  }

  const totalUif = uifEmployee + uifEmployer;

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    paye,
    uifEmployee,
    uifEmployer,
    totalUif,
    sdl,
    statutoryLiability: paye + totalUif + sdl,
    employeeCount: employeeIds.size,
    runCount: posted.length,
  };
}

export interface PayrollControlAccountCheck {
  controlAccountId: ID;
  /** Net amount actually posted to this control account during the period (a movement, not its all-time running balance — mirrors vatReportService's reconcileVatControlAccounts). */
  controlAccountMovement: number;
  reportTotal: number;
  variance: number;
  isReconciled: boolean;
}

export interface PayrollReconciliation {
  paye: PayrollControlAccountCheck;
  uifEmployee: PayrollControlAccountCheck;
  uifEmployer: PayrollControlAccountCheck;
  sdl: PayrollControlAccountCheck;
}

async function checkAccount(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  accountId: ID,
  periodStart: Date,
  periodEnd: Date,
  reportTotal: number,
): Promise<PayrollControlAccountCheck> {
  const rows = await journalEntryService.getAccountLedger(accountId);
  // Credit-normal liability accounts: a credit increases the payable.
  const movement = rows.filter((r) => inPeriod(r.date, periodStart, periodEnd)).reduce((sum, r) => sum + (r.credit - r.debit), 0);
  const variance = movement - reportTotal;
  return {
    controlAccountId: accountId,
    controlAccountMovement: movement,
    reportTotal,
    variance,
    isReconciled: Math.abs(variance) <= VARIANCE_EPSILON,
  };
}

/**
 * Compares this period's computed PAYE/UIF/SDL against what was actually
 * POSTED to the four payroll liability control accounts during that same
 * period — SA_ACCOUNTING_MASTER_SPEC.md §60's "PAYE + UIF + SDL =
 * statutory payroll liability" reconciliation, applied per-account so a
 * variance in one statutory type doesn't hide inside a combined figure
 * (§58's "do not combine all payroll liabilities into one account" applies
 * to reconciliation too, not just posting).
 */
export async function reconcilePayrollLiabilities(
  journalEntryService: Pick<JournalEntryService, 'getAccountLedger'>,
  periodStart: Date,
  periodEnd: Date,
  report: Emp201Report,
): Promise<PayrollReconciliation> {
  const [paye, uifEmployee, uifEmployer, sdl] = await Promise.all([
    checkAccount(journalEntryService, PAYE_ACCOUNT_ID, periodStart, periodEnd, report.paye),
    checkAccount(journalEntryService, UIF_EMPLOYEE_ACCOUNT_ID, periodStart, periodEnd, report.uifEmployee),
    checkAccount(journalEntryService, UIF_EMPLOYER_ACCOUNT_ID, periodStart, periodEnd, report.uifEmployer),
    checkAccount(journalEntryService, SDL_ACCOUNT_ID, periodStart, periodEnd, report.sdl),
  ]);
  return { paye, uifEmployee, uifEmployer, sdl };
}
