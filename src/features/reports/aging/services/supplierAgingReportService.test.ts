import { describe, expect, it } from 'vitest';
import type { Bill, Supplier } from '@/types';
import { billsToOpenBills } from '@/features/suppliers/utils/calculateAging';
import { buildSupplierAgingRows } from './supplierAgingReportService';

const asOf = new Date('2026-08-20T00:00:00.000Z');

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup_test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    supplierNumber: 'SUP-001',
    name: 'Test Supplier',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    ...overrides,
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill_test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    billNumber: 'BILL-TEST',
    supplierId: 'sup_test',
    issueDate: '2026-01-01',
    dueDate: '2026-01-01',
    lineItems: [],
    subtotal: 100,
    taxTotal: 0,
    total: 100,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'awaiting_payment',
    ...overrides,
  };
}

describe('buildSupplierAgingRows', () => {
  it('buckets each supplier\'s own bills independently, spanning current/30/60/90+', () => {
    const suppliers = [supplier({ id: 'sup_a', name: 'Supplier A' }), supplier({ id: 'sup_b', name: 'Supplier B' })];
    const bills = [
      // Supplier A: one current, one 1-30 overdue
      bill({ id: 'bill_a1', supplierId: 'sup_a', dueDate: '2026-09-01', total: 1000, amountPaid: 0 }), // current
      bill({ id: 'bill_a2', supplierId: 'sup_a', dueDate: '2026-08-01', total: 500, amountPaid: 0 }), // 19 days overdue -> 1-30
      // Supplier B: one 31-60 overdue, one 61+ overdue
      bill({ id: 'bill_b1', supplierId: 'sup_b', dueDate: '2026-07-01', total: 300, amountPaid: 0 }), // 50 days overdue -> 31-60
      bill({ id: 'bill_b2', supplierId: 'sup_b', dueDate: '2026-05-01', total: 400, amountPaid: 0 }), // 111 days overdue -> 90+
    ];

    const rows = buildSupplierAgingRows(suppliers, billsToOpenBills(bills), asOf);

    const rowA = rows.find((r) => r.id === 'sup_a');
    const rowB = rows.find((r) => r.id === 'sup_b');

    expect(rowA?.buckets).toEqual({ current: 1000, days30: 500, days60: 0, days90Plus: 0, total: 1500 });
    expect(rowB?.buckets).toEqual({ current: 0, days30: 0, days60: 300, days90Plus: 400, total: 700 });
  });

  it('never leaks one supplier\'s bills into another supplier\'s buckets (calculateAging filters internally by supplierId)', () => {
    const suppliers = [supplier({ id: 'sup_a', name: 'Supplier A' }), supplier({ id: 'sup_b', name: 'Supplier B' })];
    const bills = [bill({ id: 'bill_b1', supplierId: 'sup_b', dueDate: '2026-08-01', total: 5000, amountPaid: 0 })];

    const rows = buildSupplierAgingRows(suppliers, billsToOpenBills(bills), asOf);
    const rowA = rows.find((r) => r.id === 'sup_a');
    const rowB = rows.find((r) => r.id === 'sup_b');

    expect(rowA?.buckets.total).toBe(0);
    expect(rowB?.buckets.total).toBe(5000);
  });

  it('includes a supplier with no bills as a zero-balance row (filtering is the caller\'s job)', () => {
    const suppliers = [supplier({ id: 'sup_empty', name: 'No Bills Supplier' })];
    const rows = buildSupplierAgingRows(suppliers, [], asOf);
    expect(rows).toEqual([
      { id: 'sup_empty', name: 'No Bills Supplier', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 } },
    ]);
  });

  it('excludes draft and void bills via billsToOpenBills, and ages on the outstanding (unpaid) balance', () => {
    const suppliers = [supplier({ id: 'sup_a', name: 'Supplier A' })];
    const bills = [
      bill({ id: 'bill_draft', supplierId: 'sup_a', status: 'draft', dueDate: '2026-05-01', total: 9999 }),
      bill({ id: 'bill_void', supplierId: 'sup_a', status: 'void', dueDate: '2026-05-01', total: 9999 }),
      bill({ id: 'bill_partial', supplierId: 'sup_a', status: 'partially_paid', dueDate: '2026-08-01', total: 1000, amountPaid: 600 }),
    ];
    const rows = buildSupplierAgingRows(suppliers, billsToOpenBills(bills), asOf);
    expect(rows[0].buckets.days30).toBe(400);
    expect(rows[0].buckets.total).toBe(400);
  });
});
