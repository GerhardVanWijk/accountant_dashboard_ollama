import type { SalesOrder } from '@/types';

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Seed data for the Sales Orders list. Pre-accounting commitment documents —
 * no GL posting ever happens for a Sales Order
 * (docs/LEDGER_ARCHITECTURE.md). One order links back to `quo_00000001` in
 * seedQuotes to demonstrate the Quote -> Sales Order conversion path.
 */
export const seedSalesOrders: SalesOrder[] = [
  {
    id: 'so_00000001',
    orderNumber: 'SO-2026-0001',
    customerId: 'cust_00000001',
    quoteId: 'quo_00000001',
    orderDate: '2026-07-05T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_so_00000001',
        description: 'Professional Services - Consulting',
        quantity: 20,
        unitPrice: 500,
        taxAmount: 1500,
        lineTotal: 10000,
      },
    ],
    subtotal: 10000,
    taxTotal: 1500,
    total: 11500,
    currency: 'ZAR',
    status: 'confirmed',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'so_00000002',
    orderNumber: 'SO-2026-0002',
    customerId: 'cust_00000006',
    orderDate: '2026-08-02T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_so_00000002',
        description: 'Structural Steel Beams - 6m',
        quantity: 40,
        unitPrice: 1250,
        taxAmount: 7500,
        lineTotal: 50000,
      },
    ],
    subtotal: 50000,
    taxTotal: 7500,
    total: 57500,
    currency: 'ZAR',
    status: 'pending',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'so_00000003',
    orderNumber: 'SO-2026-0003',
    customerId: 'cust_00000007',
    orderDate: '2026-06-20T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_so_00000003',
        description: 'Office Furniture Package',
        quantity: 15,
        unitPrice: 2400,
        taxAmount: 5400,
        lineTotal: 36000,
      },
    ],
    subtotal: 36000,
    taxTotal: 5400,
    total: 41400,
    currency: 'ZAR',
    status: 'fulfilled',
    notes: 'Delivered and invoiced (see INV linkage on Invoices page).',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'so_00000004',
    orderNumber: 'SO-2026-0004',
    customerId: 'cust_00000008',
    orderDate: '2026-08-12T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_so_00000004',
        description: 'Marine Rope & Rigging Supplies',
        quantity: 10,
        unitPrice: 950,
        taxAmount: 1425,
        lineTotal: 9500,
      },
    ],
    subtotal: 9500,
    taxTotal: 1425,
    total: 10925,
    currency: 'ZAR',
    status: 'cancelled',
    notes: 'Customer cancelled before dispatch.',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];
