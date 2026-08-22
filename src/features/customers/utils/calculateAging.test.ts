import { describe, expect, it } from 'vitest';
import { calculateAging, calculateAgingForCustomer, getOverdueTotal } from './calculateAging';
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

describe('calculateAging', () => {
  it('buckets a not-yet-due item as current', () => {
    const buckets = calculateAging([item({ dueDate: '2026-09-01', amountOutstanding: 500 })], asOf);
    expect(buckets.current).toBe(500);
    expect(buckets.days30).toBe(0);
    expect(buckets.total).toBe(500);
  });

  it('buckets a 1-30 day overdue item correctly', () => {
    // 2026-08-01 is 19 days before asOf (2026-08-20)
    const buckets = calculateAging([item({ dueDate: '2026-08-01', amountOutstanding: 200 })], asOf);
    expect(buckets.days30).toBe(200);
    expect(buckets.total).toBe(200);
  });

  it('buckets a 31-60 day overdue item correctly', () => {
    // 2026-07-01 is 50 days before asOf
    const buckets = calculateAging([item({ dueDate: '2026-07-01', amountOutstanding: 300 })], asOf);
    expect(buckets.days60).toBe(300);
  });

  it('buckets a 61+ day overdue item correctly', () => {
    // 2026-05-01 is 111 days before asOf
    const buckets = calculateAging([item({ dueDate: '2026-05-01', amountOutstanding: 400 })], asOf);
    expect(buckets.days90Plus).toBe(400);
  });

  it('excludes fully paid items (amountOutstanding <= 0)', () => {
    const buckets = calculateAging([item({ dueDate: '2026-05-01', amountOutstanding: 0 })], asOf);
    expect(buckets.total).toBe(0);
  });

  it('sums multiple items across buckets', () => {
    const buckets = calculateAging(
      [
        item({ dueDate: '2026-09-01', amountOutstanding: 100 }), // current
        item({ dueDate: '2026-08-01', amountOutstanding: 200 }), // 1-30
        item({ dueDate: '2026-07-01', amountOutstanding: 300 }), // 31-60
        item({ dueDate: '2026-05-01', amountOutstanding: 400 }), // 61+
      ],
      asOf,
    );
    expect(buckets).toEqual({ current: 100, days30: 200, days60: 300, days90Plus: 400, total: 1000 });
  });

  it('getOverdueTotal sums every bucket except current', () => {
    const buckets = calculateAging(
      [
        item({ dueDate: '2026-09-01', amountOutstanding: 100 }),
        item({ dueDate: '2026-08-01', amountOutstanding: 200 }),
      ],
      asOf,
    );
    expect(getOverdueTotal(buckets)).toBe(200);
  });

  it('calculateAgingForCustomer filters the provided source by customerId', () => {
    const source: OpenItem[] = [
      item({ customerId: 'cust_a', dueDate: '2026-08-01', amountOutstanding: 100 }),
      item({ customerId: 'cust_b', dueDate: '2026-08-01', amountOutstanding: 900 }),
    ];
    const buckets = calculateAgingForCustomer(
      'cust_a',
      asOf,
      source.filter((i) => i.customerId === 'cust_a'),
    );
    expect(buckets.total).toBe(100);
  });
});
