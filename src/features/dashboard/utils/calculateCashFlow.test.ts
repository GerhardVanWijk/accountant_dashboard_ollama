import { describe, expect, it } from 'vitest';
import type { MonthlyFinancials } from '../mock-data/financials';
import { calculateCashFlowSeries } from './calculateCashFlow';

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

describe('calculateCashFlowSeries', () => {
  it('returns an empty array for no months', () => {
    expect(calculateCashFlowSeries([])).toEqual([]);
  });

  it('computes net cash flow per month', () => {
    const result = calculateCashFlowSeries([month({ label: 'Jan', cashIn: 1000, cashOut: 600 })]);
    expect(result[0].netCashFlow).toBe(400);
    expect(result[0].cumulativeCash).toBe(400);
  });

  it('accumulates a running cumulative cash position across months, including negative months', () => {
    const result = calculateCashFlowSeries([
      month({ label: 'Jan', cashIn: 1000, cashOut: 600 }), // net +400
      month({ label: 'Feb', cashIn: 500, cashOut: 900 }), // net -400
      month({ label: 'Mar', cashIn: 1200, cashOut: 700 }), // net +500
    ]);

    expect(result.map((p) => p.netCashFlow)).toEqual([400, -400, 500]);
    expect(result.map((p) => p.cumulativeCash)).toEqual([400, 0, 500]);
    expect(result.map((p) => p.label)).toEqual(['Jan', 'Feb', 'Mar']);
  });
});
