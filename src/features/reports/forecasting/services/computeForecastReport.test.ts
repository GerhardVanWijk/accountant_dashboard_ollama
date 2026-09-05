import { describe, expect, it } from 'vitest';
import type { Account, FinancialPlanLine, JournalEntry } from '@/types';
import {
  computeAccountMonthlySeries,
  computeActualByAccountMonth,
  computeForecastRows,
  computeNetResultMonthlySeries,
  computeVarianceEvidence,
  isVarianceFavourable,
  monthKey,
  trailingMonths,
} from './computeForecastReport';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_office_supplies', code: '6100', name: 'Office Supplies', type: 'expense', normalBalance: 'debit',
    isActive: true, createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function revenueAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acc_sales', code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit', isActive: true, createdAt: '', updatedAt: '', ...overrides };
}

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'je_1', entryNumber: 'JE-0001', date: '2026-06-15T00:00:00.000Z', status: 'posted', source: 'manual',
    lines: [], createdAt: '', updatedAt: '',
    ...overrides,
  };
}

function planLine(overrides: Partial<FinancialPlanLine> = {}): FinancialPlanLine {
  return {
    id: 'fpl_1', planType: 'budget', accountId: 'acc_office_supplies', periodYear: 2026, periodMonth: 6, amount: 40000,
    createdAt: '', updatedAt: '',
    ...overrides,
  };
}

describe('trailingMonths', () => {
  it('returns the last N months ending at the reference date, oldest first', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 8, 15)), 3); // September 2026
    expect(months.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(months.map((m) => m.label)).toEqual(['Jul 2026', 'Aug 2026', 'Sep 2026']);
  });

  it('spans a calendar-year boundary correctly for a 12-month trailing window', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 1, 1)), 12); // February 2026
    expect(months[0].key).toBe('2025-03');
    expect(months[months.length - 1].key).toBe('2026-02');
    expect(months).toHaveLength(12);
  });
});

describe('computeActualByAccountMonth', () => {
  it('nets posted lines per account per month in the account\'s own normal direction', () => {
    const accounts = [account()];
    const entries = [
      entry({ lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 5000, credit: 0 }] }),
      entry({ id: 'je_2', date: '2026-06-20T00:00:00.000Z', lines: [{ id: 'l2', accountId: 'acc_office_supplies', debit: 3000, credit: 500 }] }),
    ];
    const result = computeActualByAccountMonth(entries, accounts);
    expect(result.get('acc_office_supplies')?.get('2026-06')).toBe(5000 + (3000 - 500));
  });

  it('ignores draft/reversed-status entries — only posted lines count', () => {
    const accounts = [account()];
    const entries = [entry({ status: 'draft', lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 5000, credit: 0 }] })];
    const result = computeActualByAccountMonth(entries, accounts);
    expect(result.get('acc_office_supplies')).toBeUndefined();
  });

  it('a reversal entry (debit/credit swapped) nets its original back out to zero, same principle as calculateIncomeStatement', () => {
    const accounts = [account()];
    const entries = [
      entry({ lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 5000, credit: 0 }] }),
      entry({ id: 'je_reversal', date: '2026-06-16T00:00:00.000Z', source: 'reversal', lines: [{ id: 'l2', accountId: 'acc_office_supplies', debit: 0, credit: 5000 }] }),
    ];
    const result = computeActualByAccountMonth(entries, accounts);
    expect(result.get('acc_office_supplies')?.get('2026-06')).toBe(0);
  });

  it('skips a line whose account is not in the supplied accounts list rather than guessing a direction', () => {
    const result = computeActualByAccountMonth([entry({ lines: [{ id: 'l1', accountId: 'acc_ghost', debit: 100, credit: 0 }] })], []);
    expect(result.size).toBe(0);
  });
});

describe('isVarianceFavourable', () => {
  it('more revenue than planned is favourable', () => {
    expect(isVarianceFavourable('revenue', 500)).toBe(true);
    expect(isVarianceFavourable('revenue', -500)).toBe(false);
  });
  it('more expense than planned is unfavourable', () => {
    expect(isVarianceFavourable('expense', 500)).toBe(false);
    expect(isVarianceFavourable('expense', -500)).toBe(true);
  });
  it('returns null (no judgement) for asset/liability/equity and for exactly zero variance', () => {
    expect(isVarianceFavourable('asset', 500)).toBeNull();
    expect(isVarianceFavourable('liability', -500)).toBeNull();
    expect(isVarianceFavourable('revenue', 0)).toBeNull();
  });
});

describe('computeForecastRows — the docs worked example (Office Supplies: Budget 40,000, Actual 52,500)', () => {
  it('computes variance and variance% against the Budget baseline, flagged unfavourable', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 5, 30)), 1); // June 2026 only
    const accounts = [account()];
    const budgetLines = [planLine({ amount: 40000 })];
    const entries = [entry({ lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 52500, credit: 0 }] })];
    const actualByAccountMonth = computeActualByAccountMonth(entries, accounts);

    const rows = computeForecastRows({ accounts, budgetLines, forecastLines: [], actualByAccountMonth, months, varianceBaseline: 'budget' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ budget: 40000, forecast: 0, actual: 52500, variance: 12500, favourable: false });
    expect(rows[0].variancePercent).toBeCloseTo(31.25);
  });

  it('omits an account with zero budget, forecast AND actual in range', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 5, 30)), 1);
    const rows = computeForecastRows({ accounts: [account()], budgetLines: [], forecastLines: [], actualByAccountMonth: new Map(), months, varianceBaseline: 'budget' });
    expect(rows).toHaveLength(0);
  });

  it('variancePercent is null when the baseline is exactly zero (no divide-by-zero)', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 5, 30)), 1);
    const accounts = [account()];
    const entries = [entry({ lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 1000, credit: 0 }] })];
    const actualByAccountMonth = computeActualByAccountMonth(entries, accounts);
    const rows = computeForecastRows({ accounts, budgetLines: [], forecastLines: [], actualByAccountMonth, months, varianceBaseline: 'budget' });
    expect(rows[0].variancePercent).toBeNull();
  });

  it('switching the baseline to forecast changes variance without touching budget/actual', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 5, 30)), 1);
    const accounts = [account()];
    const budgetLines = [planLine({ amount: 40000 })];
    const forecastLines = [planLine({ id: 'fpl_2', planType: 'forecast', amount: 50000 })];
    const entries = [entry({ lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 52500, credit: 0 }] })];
    const actualByAccountMonth = computeActualByAccountMonth(entries, accounts);

    const vsForecast = computeForecastRows({ accounts, budgetLines, forecastLines, actualByAccountMonth, months, varianceBaseline: 'forecast' });
    expect(vsForecast[0]).toMatchObject({ budget: 40000, forecast: 50000, actual: 52500, variance: 2500 });
  });

  it('sums plan lines across a multi-month range', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 6, 31)), 2); // Jun + Jul 2026
    const accounts = [account()];
    const budgetLines = [planLine({ amount: 40000, periodMonth: 6 }), planLine({ id: 'fpl_2', amount: 42000, periodMonth: 7 })];
    const rows = computeForecastRows({ accounts, budgetLines, forecastLines: [], actualByAccountMonth: new Map(), months, varianceBaseline: 'budget' });
    expect(rows[0].budget).toBe(82000);
  });
});

describe('computeNetResultMonthlySeries', () => {
  it('Net = revenue - expense, for budget/forecast/actual, per month', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 5, 30)), 1);
    const accounts = [account(), revenueAccount()];
    const budgetLines = [
      planLine({ amount: 40000, accountId: 'acc_office_supplies' }),
      planLine({ id: 'fpl_2', amount: 100000, accountId: 'acc_sales' }),
    ];
    const entries = [
      entry({ lines: [
        { id: 'l1', accountId: 'acc_office_supplies', debit: 52500, credit: 0 },
        { id: 'l2', accountId: 'acc_sales', debit: 0, credit: 110000 },
      ] }),
    ];
    const actualByAccountMonth = computeActualByAccountMonth(entries, accounts);
    const series = computeNetResultMonthlySeries({ accounts, budgetLines, forecastLines: [], actualByAccountMonth, months });
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ budget: 100000 - 40000, actual: 110000 - 52500, forecast: 0 });
  });
});

describe('computeAccountMonthlySeries', () => {
  it('one account\'s own budget/forecast/actual trend across months', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 6, 31)), 2);
    const budgetLines = [planLine({ amount: 40000, periodMonth: 6 }), planLine({ id: 'fpl_2', amount: 42000, periodMonth: 7 })];
    const entries = [entry({ lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 52500, credit: 0 }] })];
    const actualByAccountMonth = computeActualByAccountMonth(entries, [account()]);
    const series = computeAccountMonthlySeries({ accountId: 'acc_office_supplies', budgetLines, forecastLines: [], actualByAccountMonth, months });
    expect(series).toEqual([
      { key: '2026-06', label: 'Jun 2026', budget: 40000, forecast: 0, actual: 52500 },
      { key: '2026-07', label: 'Jul 2026', budget: 42000, forecast: 0, actual: 0 },
    ]);
  });
});

describe('computeVarianceEvidence — deterministic, evidence-based, never a fabricated explanation', () => {
  it('identifies the largest contributing entry and groups contributions by source', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 5, 30)), 1);
    const accounts = [account()];
    const entries = [
      entry({ id: 'je_a', entryNumber: 'JE-0010', source: 'bill', lines: [{ id: 'l1', accountId: 'acc_office_supplies', debit: 30000, credit: 0 }] }),
      entry({ id: 'je_b', entryNumber: 'JE-0011', source: 'bill', lines: [{ id: 'l2', accountId: 'acc_office_supplies', debit: 15000, credit: 0 }] }),
      entry({ id: 'je_c', entryNumber: 'JE-0012', source: 'manual', lines: [{ id: 'l3', accountId: 'acc_office_supplies', debit: 7500, credit: 0 }] }),
    ];
    const evidence = computeVarianceEvidence(entries, accounts, 'acc_office_supplies', months);
    expect(evidence.entryCount).toBe(3);
    expect(evidence.largestEntry).toMatchObject({ entryId: 'je_a', amount: 30000 });
    expect(evidence.bySource[0]).toMatchObject({ source: 'bill', amount: 45000, count: 2 });
    expect(evidence.bySource[1]).toMatchObject({ source: 'manual', amount: 7500, count: 1 });
  });

  it('returns zero evidence for an account with no activity in range', () => {
    const months = trailingMonths(new Date(Date.UTC(2026, 5, 30)), 1);
    const evidence = computeVarianceEvidence([], [account()], 'acc_office_supplies', months);
    expect(evidence.entryCount).toBe(0);
    expect(evidence.largestEntry).toBeUndefined();
    expect(evidence.bySource).toEqual([]);
  });
});

describe('monthKey', () => {
  it('zero-pads the month', () => {
    expect(monthKey(2026, 3)).toBe('2026-03');
    expect(monthKey(2026, 12)).toBe('2026-12');
  });
});
