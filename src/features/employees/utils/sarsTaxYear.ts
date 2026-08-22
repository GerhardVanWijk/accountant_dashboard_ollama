/**
 * The SARS tax year runs 1 March to end-February — fixed by statute, not
 * something requiring "professional verification" the way a rate or
 * bracket does. Distinct from this company's accounting FinancialYear
 * (src/types/financialYear.ts), which may run on any month-end
 * (SA_ACCOUNTING_MASTER_SPEC.md §59: "the tax engine must understand that
 * ACCOUNTING YEAR and SARS TAX YEAR are not necessarily the same thing").
 * Used to group PayrollRuns by SARS tax year for EMP501 (emp501Service.ts)
 * without touching accountingPeriodService/financialYearService at all.
 */
export interface SarsTaxYear {
  /** e.g. "2024/2025". */
  label: string;
  /** 1 March, 00:00:00 UTC. */
  start: Date;
  /** End of February, 23:59:59.999 UTC. */
  end: Date;
}

/** The SARS tax year containing `date` (defaults to now). */
export function getSarsTaxYear(date: Date = new Date()): SarsTaxYear {
  // If the date falls in Jan/Feb, the tax year STARTED the previous calendar year.
  const startYear = date.getUTCMonth() >= 2 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  const start = new Date(Date.UTC(startYear, 2, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(startYear + 1, 2, 0, 23, 59, 59, 999)); // day 0 of March = last day of Feb
  return { label: `${startYear}/${startYear + 1}`, start, end };
}
