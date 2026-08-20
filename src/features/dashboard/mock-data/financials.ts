/**
 * TEMPORARY: superseded once Banking/Accounting modules provide real GL
 * data (Phase 2). No real ledger/bank-transaction module exists yet, so
 * the Executive Dashboard's KPI cards and Revenue vs Expenses / Cash Flow
 * charts are computed from this small, dashboard-owned mock monthly time
 * series instead of a live source (see ../utils/calculateKpis.ts and
 * ../utils/calculateCashFlow.ts). Nothing outside src/features/dashboard/
 * should depend on this shape — delete/replace it once Banking/Accounting
 * ship real transaction data.
 */
export interface MonthlyFinancials {
  /** ISO month key, e.g. "2026-08". */
  month: string;
  /** Short chart-axis label, e.g. "Aug". */
  label: string;
  revenue: number;
  expenses: number;
  /** Cash received from operations this month. */
  cashIn: number;
  /** Cash paid out this month. */
  cashOut: number;
}

/** Trailing six months ending in the current seed month (August 2026). */
export const mockMonthlyFinancials: MonthlyFinancials[] = [
  { month: '2026-03', label: 'Mar', revenue: 412500, expenses: 318200, cashIn: 398000, cashOut: 331500 },
  { month: '2026-04', label: 'Apr', revenue: 438900, expenses: 329700, cashIn: 421300, cashOut: 340800 },
  { month: '2026-05', label: 'May', revenue: 405200, expenses: 341600, cashIn: 389500, cashOut: 352100 },
  { month: '2026-06', label: 'Jun', revenue: 461800, expenses: 356300, cashIn: 447200, cashOut: 358900 },
  { month: '2026-07', label: 'Jul', revenue: 489300, expenses: 372100, cashIn: 468700, cashOut: 379400 },
  { month: '2026-08', label: 'Aug', revenue: 512700, expenses: 384900, cashIn: 493100, cashOut: 391200 },
];
