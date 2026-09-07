import { describe, expect, it } from 'vitest';
import { calculateDashboardV3Metrics } from './calculateDashboardV3Metrics';
import type { MonthlyFinancials } from './calculateMonthlyFinancials';

function month(overrides: Partial<MonthlyFinancials>): MonthlyFinancials {
  return { month: '2026-09', label: 'Sep', revenue: 0, cogs: 0, expenses: 0, operatingExpenses: 0, cashIn: 0, cashOut: 0, ...overrides };
}

describe('calculateDashboardV3Metrics', () => {
  it('computes gross profit, net profit, gross margin, net margin, and realized stock margin from posted monthly GL buckets', () => {
    const metrics = calculateDashboardV3Metrics([
      month({ revenue: 1000, cogs: 400, expenses: 650, operatingExpenses: 250 }),
      month({ revenue: 500, cogs: 200, expenses: 350, operatingExpenses: 150 }),
    ]);

    expect(metrics.grossProfit).toBe(900);
    expect(metrics.netProfit).toBe(500);
    expect(metrics.grossMarginPercent).toBeCloseTo(60);
    expect(metrics.netMarginPercent).toBeCloseTo(33.333, 3);
    expect(metrics.realizedStockMarginPercent).toBeCloseTo(60);
  });

  it('does not fabricate percentages when revenue or posted COGS is missing', () => {
    const metrics = calculateDashboardV3Metrics([month({ revenue: 0, cogs: 0 })]);
    expect(metrics.grossMarginPercent).toBeNull();
    expect(metrics.realizedStockMarginPercent).toBeNull();
  });
});
