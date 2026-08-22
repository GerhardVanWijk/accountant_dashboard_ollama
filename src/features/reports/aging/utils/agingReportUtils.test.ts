import { describe, expect, it } from 'vitest';
import { filterZeroBalance, sortByTotalDescending, sumAgingBuckets } from './agingReportUtils';
import type { AgingReportRow } from '../types';

function row(overrides: Partial<AgingReportRow> = {}): AgingReportRow {
  return {
    id: 'row_test',
    name: 'Test Row',
    buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 },
    ...overrides,
  };
}

describe('sumAgingBuckets', () => {
  it('sums every bucket column across all rows (grand-total footer)', () => {
    const rows: AgingReportRow[] = [
      row({ id: 'a', buckets: { current: 100, days30: 50, days60: 0, days90Plus: 0, total: 150 } }),
      row({ id: 'b', buckets: { current: 0, days30: 200, days60: 300, days90Plus: 400, total: 900 } }),
    ];
    expect(sumAgingBuckets(rows)).toEqual({ current: 100, days30: 250, days60: 300, days90Plus: 400, total: 1050 });
  });

  it('returns all-zero buckets for an empty row set', () => {
    expect(sumAgingBuckets([])).toEqual({ current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 });
  });
});

describe('filterZeroBalance', () => {
  const rows: AgingReportRow[] = [
    row({ id: 'has-balance', buckets: { current: 100, days30: 0, days60: 0, days90Plus: 0, total: 100 } }),
    row({ id: 'zero-balance', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 } }),
  ];

  it('excludes zero-balance rows by default (showAll = false)', () => {
    const result = filterZeroBalance(rows, false);
    expect(result.map((r) => r.id)).toEqual(['has-balance']);
  });

  it('includes zero-balance rows when showAll = true', () => {
    const result = filterZeroBalance(rows, true);
    expect(result.map((r) => r.id)).toEqual(['has-balance', 'zero-balance']);
  });
});

describe('sortByTotalDescending', () => {
  it('sorts worst debtors/largest payables first', () => {
    const rows: AgingReportRow[] = [
      row({ id: 'small', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 100 } }),
      row({ id: 'large', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 900 } }),
      row({ id: 'medium', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 500 } }),
    ];
    expect(sortByTotalDescending(rows).map((r) => r.id)).toEqual(['large', 'medium', 'small']);
  });

  it('does not mutate the input array', () => {
    const rows: AgingReportRow[] = [row({ id: 'a', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 1 } })];
    const original = [...rows];
    sortByTotalDescending(rows);
    expect(rows).toEqual(original);
  });
});
