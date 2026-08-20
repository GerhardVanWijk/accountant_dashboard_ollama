import { describe, expect, it } from 'vitest';
import type { MonthlyFinancials } from '../mock-data/financials';
import { calculateDashboardKpis } from './calculateKpis';

function month(overrides: Partial<MonthlyFinancials>): MonthlyFinancials {
  return {
    month: '2026-01',
    label: 'Jan',
    revenue: 0,
    expenses: 0,
    cashIn: 0,
    cashOut: 0,
    ...overrides,
  };
}

describe('calculateDashboardKpis', () => {
  it('returns all-zero KPIs for an empty months list', () => {
    const kpis = calculateDashboardKpis([]);
    expect(kpis.revenue.value).toBe(0);
    expect(kpis.revenue.trendPercent).toBe(0);
    expect(kpis.expenses.value).toBe(0);
    expect(kpis.netProfit.value).toBe(0);
    expect(kpis.cashPosition.value).toBe(0);
  });

  it('uses the latest month values and a zero trend when there is only one month', () => {
    const kpis = calculateDashboardKpis([
      month({ label: 'Jan', revenue: 1000, expenses: 600, cashIn: 900, cashOut: 500 }),
    ]);
    expect(kpis.revenue.value).toBe(1000);
    expect(kpis.revenue.trendPercent).toBe(0);
    expect(kpis.expenses.value).toBe(600);
    expect(kpis.netProfit.value).toBe(400);
    expect(kpis.cashPosition.value).toBe(400);
  });

  it('computes period-over-period trend percent between the last two months', () => {
    const kpis = calculateDashboardKpis([
      month({ label: 'Jan', revenue: 1000, expenses: 500, cashIn: 900, cashOut: 400 }),
      month({ label: 'Feb', revenue: 1200, expenses: 550, cashIn: 1000, cashOut: 450 }),
    ]);

    // revenue: 1000 -> 1200 = +20%
    expect(kpis.revenue.value).toBe(1200);
    expect(kpis.revenue.trendPercent).toBeCloseTo(20, 5);

    // expenses: 500 -> 550 = +10%
    expect(kpis.expenses.value).toBe(550);
    expect(kpis.expenses.trendPercent).toBeCloseTo(10, 5);

    // net profit: 500 -> 650 = +30%
    expect(kpis.netProfit.value).toBe(650);
    expect(kpis.netProfit.trendPercent).toBeCloseTo(30, 5);

    // cash position: Jan net = 500 (cumulative 500), Feb net = 550 (cumulative 1050) = +110%
    expect(kpis.cashPosition.value).toBe(1050);
    expect(kpis.cashPosition.trendPercent).toBeCloseTo(110, 5);
  });

  it('treats a swing from zero as a 100% increase rather than dividing by zero', () => {
    const kpis = calculateDashboardKpis([
      month({ label: 'Jan', revenue: 0, expenses: 0, cashIn: 0, cashOut: 0 }),
      month({ label: 'Feb', revenue: 500, expenses: 0, cashIn: 0, cashOut: 0 }),
    ]);
    expect(kpis.revenue.trendPercent).toBe(100);
  });
});
