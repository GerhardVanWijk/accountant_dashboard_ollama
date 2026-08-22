import { describe, expect, it } from 'vitest';
import type { Customer, Invoice } from '@/types';
import { invoicesToOpenItems } from '@/features/customers/mock-data/openItems';
import { buildCustomerAgingRows } from './customerAgingReportService';

const asOf = new Date('2026-08-20T00:00:00.000Z');

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    customerNumber: 'CUST-001',
    name: 'Test Customer',
    currency: 'ZAR',
    balance: 0,
    status: 'active',
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    invoiceNumber: 'INV-TEST',
    customerId: 'cust_test',
    issueDate: '2026-01-01',
    dueDate: '2026-01-01',
    lineItems: [],
    subtotal: 100,
    taxTotal: 0,
    total: 100,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    ...overrides,
  };
}

describe('buildCustomerAgingRows', () => {
  it('buckets each customer\'s own invoices independently, spanning current/30/60/90+', () => {
    const customers = [
      customer({ id: 'cust_a', name: 'Customer A' }),
      customer({ id: 'cust_b', name: 'Customer B' }),
    ];
    const invoices = [
      // Customer A: one current, one 1-30 overdue
      invoice({ id: 'inv_a1', customerId: 'cust_a', dueDate: '2026-09-01', total: 1000, amountPaid: 0 }), // current
      invoice({ id: 'inv_a2', customerId: 'cust_a', dueDate: '2026-08-01', total: 500, amountPaid: 0 }), // 19 days overdue -> 1-30
      // Customer B: one 31-60 overdue, one 61+ overdue
      invoice({ id: 'inv_b1', customerId: 'cust_b', dueDate: '2026-07-01', total: 300, amountPaid: 0 }), // 50 days overdue -> 31-60
      invoice({ id: 'inv_b2', customerId: 'cust_b', dueDate: '2026-05-01', total: 400, amountPaid: 0 }), // 111 days overdue -> 90+
    ];

    const rows = buildCustomerAgingRows(customers, invoicesToOpenItems(invoices), asOf);

    const rowA = rows.find((r) => r.id === 'cust_a');
    const rowB = rows.find((r) => r.id === 'cust_b');

    expect(rowA?.buckets).toEqual({ current: 1000, days30: 500, days60: 0, days90Plus: 0, total: 1500 });
    expect(rowB?.buckets).toEqual({ current: 0, days30: 0, days60: 300, days90Plus: 400, total: 700 });
  });

  it('never leaks one customer\'s invoices into another customer\'s buckets', () => {
    // Regression test for the calculateAgingForCustomer() gap: passing the
    // full openItems array as `source` bypasses its internal filtering
    // (the customerId param only filters via the *default* source value),
    // so buildCustomerAgingRows must filter explicitly per customer.
    const customers = [customer({ id: 'cust_a', name: 'Customer A' }), customer({ id: 'cust_b', name: 'Customer B' })];
    const invoices = [invoice({ id: 'inv_b1', customerId: 'cust_b', dueDate: '2026-08-01', total: 5000, amountPaid: 0 })];

    const rows = buildCustomerAgingRows(customers, invoicesToOpenItems(invoices), asOf);
    const rowA = rows.find((r) => r.id === 'cust_a');
    const rowB = rows.find((r) => r.id === 'cust_b');

    expect(rowA?.buckets.total).toBe(0);
    expect(rowB?.buckets.total).toBe(5000);
  });

  it('includes a customer with no invoices as a zero-balance row (filtering is the caller\'s job)', () => {
    const customers = [customer({ id: 'cust_empty', name: 'No Invoices Customer' })];
    const rows = buildCustomerAgingRows(customers, [], asOf);
    expect(rows).toEqual([
      { id: 'cust_empty', name: 'No Invoices Customer', buckets: { current: 0, days30: 0, days60: 0, days90Plus: 0, total: 0 } },
    ]);
  });

  it('excludes draft and void invoices via invoicesToOpenItems, and ages on the outstanding (unpaid) balance', () => {
    const customers = [customer({ id: 'cust_a', name: 'Customer A' })];
    const invoices = [
      invoice({ id: 'inv_draft', customerId: 'cust_a', status: 'draft', dueDate: '2026-05-01', total: 9999 }),
      invoice({ id: 'inv_void', customerId: 'cust_a', status: 'void', dueDate: '2026-05-01', total: 9999 }),
      invoice({ id: 'inv_partial', customerId: 'cust_a', status: 'partially_paid', dueDate: '2026-08-01', total: 1000, amountPaid: 600 }),
    ];
    const rows = buildCustomerAgingRows(customers, invoicesToOpenItems(invoices), asOf);
    expect(rows[0].buckets.days30).toBe(400);
    expect(rows[0].buckets.total).toBe(400);
  });
});
