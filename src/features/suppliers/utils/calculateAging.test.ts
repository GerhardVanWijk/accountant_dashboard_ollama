import { describe, expect, it } from 'vitest';
import { calculateAging, hasOpenBills, type MockOpenBill } from './calculateAging';

const supplierId = 'sup_test';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe('calculateAging', () => {
  it('buckets a not-yet-due bill as current', () => {
    const bills: MockOpenBill[] = [
      { id: 'b1', supplierId, amount: 1000, issueDate: daysAgo(5), dueDate: daysAgo(-10) },
    ];
    const result = calculateAging(supplierId, new Date(), bills);
    expect(result.current).toBe(1000);
    expect(result.days30).toBe(0);
    expect(result.days60).toBe(0);
    expect(result.days90Plus).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('buckets a bill 15 days overdue into the 30-day bucket', () => {
    const bills: MockOpenBill[] = [
      { id: 'b1', supplierId, amount: 500, issueDate: daysAgo(40), dueDate: daysAgo(15) },
    ];
    const result = calculateAging(supplierId, new Date(), bills);
    expect(result.days30).toBe(500);
    expect(result.current).toBe(0);
  });

  it('buckets a bill 45 days overdue into the 60-day bucket', () => {
    const bills: MockOpenBill[] = [
      { id: 'b1', supplierId, amount: 750, issueDate: daysAgo(70), dueDate: daysAgo(45) },
    ];
    const result = calculateAging(supplierId, new Date(), bills);
    expect(result.days60).toBe(750);
  });

  it('buckets a bill 120 days overdue into the 90+ bucket', () => {
    const bills: MockOpenBill[] = [
      { id: 'b1', supplierId, amount: 900, issueDate: daysAgo(150), dueDate: daysAgo(120) },
    ];
    const result = calculateAging(supplierId, new Date(), bills);
    expect(result.days90Plus).toBe(900);
  });

  it('sums multiple bills across buckets into the total', () => {
    const bills: MockOpenBill[] = [
      { id: 'b1', supplierId, amount: 100, issueDate: daysAgo(5), dueDate: daysAgo(-5) }, // current
      { id: 'b2', supplierId, amount: 200, issueDate: daysAgo(40), dueDate: daysAgo(20) }, // 30
      { id: 'b3', supplierId, amount: 300, issueDate: daysAgo(100), dueDate: daysAgo(95) }, // 90+
    ];
    const result = calculateAging(supplierId, new Date(), bills);
    expect(result.current).toBe(100);
    expect(result.days30).toBe(200);
    expect(result.days90Plus).toBe(300);
    expect(result.total).toBe(600);
  });

  it('ignores bills belonging to other suppliers', () => {
    const bills: MockOpenBill[] = [
      { id: 'b1', supplierId: 'sup_other', amount: 999, issueDate: daysAgo(5), dueDate: daysAgo(-5) },
    ];
    const result = calculateAging(supplierId, new Date(), bills);
    expect(result.total).toBe(0);
  });

  it('returns all-zero buckets for a supplier with no open bills', () => {
    const result = calculateAging(supplierId, new Date(), []);
    expect(result).toEqual({ current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 });
  });
});

describe('hasOpenBills', () => {
  it('is true when the supplier has at least one open bill', () => {
    const bills: MockOpenBill[] = [{ id: 'b1', supplierId, amount: 1, issueDate: daysAgo(1), dueDate: daysAgo(-1) }];
    expect(hasOpenBills(supplierId, bills)).toBe(true);
  });

  it('is false when the supplier has no open bills', () => {
    expect(hasOpenBills(supplierId, [])).toBe(false);
  });
});
