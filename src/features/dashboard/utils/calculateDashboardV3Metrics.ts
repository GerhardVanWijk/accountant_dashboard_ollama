import type { MonthlyFinancials } from './calculateMonthlyFinancials';

export interface DashboardV3Metrics {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  grossMarginPercent: number | null;
  netMarginPercent: number | null;
  realizedStockMarginPercent: number | null;
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export function calculateDashboardV3Metrics(months: MonthlyFinancials[]): DashboardV3Metrics {
  const totals = months.reduce(
    (sum, month) => ({
      revenue: sum.revenue + month.revenue,
      cogs: sum.cogs + month.cogs,
      operatingExpenses: sum.operatingExpenses + month.operatingExpenses,
    }),
    { revenue: 0, cogs: 0, operatingExpenses: 0 },
  );
  const grossProfit = totals.revenue - totals.cogs;
  const netProfit = grossProfit - totals.operatingExpenses;

  return {
    ...totals,
    grossProfit,
    netProfit,
    grossMarginPercent: percent(grossProfit, totals.revenue),
    netMarginPercent: percent(netProfit, totals.revenue),
    realizedStockMarginPercent: totals.cogs > 0 ? percent(grossProfit, totals.revenue) : null,
  };
}
