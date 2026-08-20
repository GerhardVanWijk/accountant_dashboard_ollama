import { describe, expect, it } from 'vitest';
import { calculateFinancialSummary } from './customerFinancials';
import type { OpenItem } from '../mock-data/openItems';

const asOf = new Date('2026-08-20T00:00:00.000Z');

function item(overrides: Partial<OpenItem>): OpenItem {
  return {
    id: 'oi_test',
    customerId: 'cust_test',
    reference: 'INV-TEST',
    issueDate: '2026-01-01',
    dueDate: '2026-01-01',
    amount: 100,
    amountOutstanding: 100,
    ...overrides,
  };
}

describe('calculateFinancialSummary', () => {
  it('computes totalOutstanding and overdueBalance from open items', () => {
    const source: OpenItem[] = [
      item({ dueDate: '2026-09-01', amount: 100, amountOutstanding: 100 }), // current
      item({ dueDate: '2026-08-01', amount: 200, amountOutstanding: 200 }), // overdue
    ];
    const summary = calculateFinancialSummary({ id: 'cust_test', creditLimit: undefined }, asOf, source);
    expect(summary.totalOutstanding).toBe(300);
    expect(summary.overdueBalance).toBe(200);
  });

  it('returns null availableCredit when no credit limit is set', () => {
    const summary = calculateFinancialSummary({ id: 'cust_test' }, asOf, []);
    expect(summary.availableCredit).toBeNull();
  });

  it('computes availableCredit as creditLimit minus totalOutstanding (can go negative)', () => {
    const source: OpenItem[] = [item({ dueDate: '2026-08-01', amount: 500, amountOutstanding: 500 })];
    const summary = calculateFinancialSummary({ id: 'cust_test', creditLimit: 400 }, asOf, source);
    expect(summary.availableCredit).toBe(-100);
  });

  it('sums ytdSales from every item issued this calendar year regardless of paid status', () => {
    const source: OpenItem[] = [
      item({ issueDate: '2026-02-01', amount: 1000, amountOutstanding: 0 }), // paid, still counts toward YTD sales
      item({ issueDate: '2026-06-01', amount: 500, amountOutstanding: 500 }),
      item({ issueDate: '2025-12-01', amount: 9999, amountOutstanding: 9999 }), // prior year, excluded
    ];
    const summary = calculateFinancialSummary({ id: 'cust_test' }, asOf, source);
    expect(summary.ytdSales).toBe(1500);
  });
});
