import type { ISODateString, PayrollRun } from '@/types';
import type { SarsTaxYear } from '../utils/sarsTaxYear';
import { computeEmp201Report } from './emp201Service';

export interface Emp501MonthRow {
  monthLabel: string;
  monthStart: ISODateString;
  monthEnd: ISODateString;
  paye: number;
  uifEmployee: number;
  uifEmployer: number;
  sdl: number;
  statutoryLiability: number;
  runCount: number;
}

/**
 * The bi-annual EMP501 reconciliation (SA_ACCOUNTING_MASTER_SPEC.md
 * §57/§60/§116 Phase 8): reconciles a full SARS tax year's (1 March-end
 * February, §59 — see sarsTaxYear.ts) worth of monthly EMP201-equivalent
 * totals against each other, month by month, so a shortfall in any single
 * month is visible before the bi-annual submission. Like emp201Service.ts,
 * this is the reconciliation SARS requires an employer to PREPARE — this
 * codebase does not submit anything to SARS/e-filing, it only computes the
 * figures from real posted payroll data.
 */
export interface Emp501Report {
  taxYearLabel: string;
  taxYearStart: ISODateString;
  taxYearEnd: ISODateString;
  months: Emp501MonthRow[];
  totals: {
    paye: number;
    uifEmployee: number;
    uifEmployer: number;
    sdl: number;
    statutoryLiability: number;
  };
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Computes one row per calendar month of the SARS tax year, reusing computeEmp201Report() per month so the two reports can never disagree on how a month's totals are derived. */
export function computeEmp501Report(taxYear: SarsTaxYear, runs: PayrollRun[]): Emp501Report {
  const months: Emp501MonthRow[] = [];
  let cursorYear = taxYear.start.getUTCFullYear();
  let cursorMonth = taxYear.start.getUTCMonth();

  let monthStart = new Date(Date.UTC(cursorYear, cursorMonth, 1, 0, 0, 0, 0));
  while (monthStart <= taxYear.end) {
    const monthEnd = new Date(Date.UTC(cursorYear, cursorMonth + 1, 0, 23, 59, 59, 999));

    const emp201 = computeEmp201Report(monthStart, monthEnd, runs);
    months.push({
      monthLabel: monthLabel(monthStart),
      monthStart: monthStart.toISOString(),
      monthEnd: monthEnd.toISOString(),
      paye: emp201.paye,
      uifEmployee: emp201.uifEmployee,
      uifEmployer: emp201.uifEmployer,
      sdl: emp201.sdl,
      statutoryLiability: emp201.statutoryLiability,
      runCount: emp201.runCount,
    });

    cursorMonth += 1;
    if (cursorMonth > 11) {
      cursorMonth = 0;
      cursorYear += 1;
    }
    monthStart = new Date(Date.UTC(cursorYear, cursorMonth, 1, 0, 0, 0, 0));
  }

  const totals = months.reduce(
    (acc, m) => ({
      paye: acc.paye + m.paye,
      uifEmployee: acc.uifEmployee + m.uifEmployee,
      uifEmployer: acc.uifEmployer + m.uifEmployer,
      sdl: acc.sdl + m.sdl,
      statutoryLiability: acc.statutoryLiability + m.statutoryLiability,
    }),
    { paye: 0, uifEmployee: 0, uifEmployer: 0, sdl: 0, statutoryLiability: 0 },
  );

  return {
    taxYearLabel: taxYear.label,
    taxYearStart: taxYear.start.toISOString(),
    taxYearEnd: taxYear.end.toISOString(),
    months,
    totals,
  };
}
