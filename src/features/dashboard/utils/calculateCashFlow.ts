import type { MonthlyFinancials } from '../mock-data/financials';

export interface CashFlowPoint {
  label: string;
  /** cashIn - cashOut for this month. */
  netCashFlow: number;
  /** Running sum of netCashFlow up to and including this month — the Cash Position figure. */
  cumulativeCash: number;
}

/**
 * Derives per-month net cash flow and running cumulative cash position
 * from the TEMPORARY mock monthly financials (../mock-data/financials.ts).
 * Kept out of JSX per docs/DO_NOT_BREAK.md ("never perform isolated
 * UI-only math for financial totals") — CashFlowChart and the Cash
 * Position KPI card only render this already-computed result.
 */
export function calculateCashFlowSeries(months: MonthlyFinancials[]): CashFlowPoint[] {
  let running = 0;
  return months.map((m) => {
    const netCashFlow = m.cashIn - m.cashOut;
    running += netCashFlow;
    return { label: m.label, netCashFlow, cumulativeCash: running };
  });
}
