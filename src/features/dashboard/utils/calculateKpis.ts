import type { MonthlyFinancials } from './calculateMonthlyFinancials';
import { calculateCashFlowSeries } from './calculateCashFlow';

export interface KpiTrend {
  label: string;
  value: number;
  /** Percentage change vs the prior period (positive = up, negative = down). */
  trendPercent: number;
}

export interface DashboardKpis {
  revenue: KpiTrend;
  expenses: KpiTrend;
  netProfit: KpiTrend;
  cashPosition: KpiTrend;
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function emptyKpis(): DashboardKpis {
  return {
    revenue: { label: 'Revenue', value: 0, trendPercent: 0 },
    expenses: { label: 'Expenses', value: 0, trendPercent: 0 },
    netProfit: { label: 'Net Profit', value: 0, trendPercent: 0 },
    cashPosition: { label: 'Cash Position', value: 0, trendPercent: 0 },
  };
}

/**
 * Computes the four Executive Dashboard KPI cards (Revenue, Expenses, Net
 * Profit, Cash Position) plus each one's period-over-period trend
 * percentage (latest month vs the month before it), from real monthly
 * financials (./calculateMonthlyFinancials.ts, computed from posted GL
 * entries — see that file's doc comment). Kept out of JSX per
 * docs/DO_NOT_BREAK.md.
 */
export function calculateDashboardKpis(months: MonthlyFinancials[]): DashboardKpis {
  if (months.length === 0) return emptyKpis();

  const latest = months[months.length - 1];
  const previous = months.length > 1 ? months[months.length - 2] : undefined;

  const netProfitLatest = latest.revenue - latest.expenses;
  const netProfitPrevious = previous ? previous.revenue - previous.expenses : netProfitLatest;

  const cashFlow = calculateCashFlowSeries(months);
  const cashLatest = cashFlow[cashFlow.length - 1].cumulativeCash;
  const cashPrevious = cashFlow.length > 1 ? cashFlow[cashFlow.length - 2].cumulativeCash : cashLatest;

  return {
    revenue: {
      label: 'Revenue',
      value: latest.revenue,
      trendPercent: percentChange(latest.revenue, previous?.revenue ?? latest.revenue),
    },
    expenses: {
      label: 'Expenses',
      value: latest.expenses,
      trendPercent: percentChange(latest.expenses, previous?.expenses ?? latest.expenses),
    },
    netProfit: {
      label: 'Net Profit',
      value: netProfitLatest,
      trendPercent: percentChange(netProfitLatest, netProfitPrevious),
    },
    cashPosition: {
      label: 'Cash Position',
      value: cashLatest,
      trendPercent: percentChange(cashLatest, cashPrevious),
    },
  };
}
