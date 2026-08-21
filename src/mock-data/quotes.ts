import type { Quote } from '@/types';

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Seed data for the Quotes list. Pre-accounting commitment documents — no
 * GL posting ever happens for a Quote (docs/LEDGER_ARCHITECTURE.md).
 * A spread of statuses across the same customers used by seedInvoices so
 * cross-module lookups (customer name, "accepted" -> Convert to Sales
 * Order) have something real to show.
 */
export const seedQuotes: Quote[] = [
  {
    id: 'quo_00000001',
    quoteNumber: 'QUO-2026-0001',
    customerId: 'cust_00000001',
    issueDate: '2026-07-01T00:00:00.000Z',
    expiryDate: '2026-07-31T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_q_00000001',
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
    status: 'accepted',
    notes: 'Valid for 30 days from issue.',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'quo_00000002',
    quoteNumber: 'QUO-2026-0002',
    customerId: 'cust_00000002',
    issueDate: '2026-07-15T00:00:00.000Z',
    expiryDate: '2026-08-14T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_q_00000002',
        description: 'Warehouse Racking Installation',
        quantity: 1,
        unitPrice: 45000,
        taxAmount: 6750,
        lineTotal: 45000,
      },
    ],
    subtotal: 45000,
    taxTotal: 6750,
    total: 51750,
    currency: 'ZAR',
    status: 'sent',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'quo_00000003',
    quoteNumber: 'QUO-2026-0003',
    customerId: 'cust_00000003',
    issueDate: '2026-06-01T00:00:00.000Z',
    expiryDate: '2026-06-30T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_q_00000003',
        description: 'Bulk Fertiliser Supply - Q3',
        quantity: 50,
        unitPrice: 800,
        taxAmount: 6000,
        lineTotal: 40000,
      },
    ],
    subtotal: 40000,
    taxTotal: 6000,
    total: 46000,
    currency: 'ZAR',
    status: 'expired',
    notes: 'Customer did not respond before expiry.',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'quo_00000004',
    quoteNumber: 'QUO-2026-0004',
    customerId: 'cust_00000004',
    issueDate: '2026-08-01T00:00:00.000Z',
    expiryDate: '2026-08-31T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_q_00000004',
        description: 'Roastery Equipment Servicing',
        quantity: 2,
        unitPrice: 3200,
        taxAmount: 960,
        lineTotal: 6400,
      },
    ],
    subtotal: 6400,
    taxTotal: 960,
    total: 7360,
    currency: 'ZAR',
    status: 'declined',
    notes: 'Customer opted for an in-house solution.',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'quo_00000005',
    quoteNumber: 'QUO-2026-0005',
    customerId: 'cust_00000005',
    issueDate: '2026-08-10T00:00:00.000Z',
    expiryDate: '2026-09-09T00:00:00.000Z',
    lineItems: [
      {
        id: 'li_q_00000005',
        description: 'Freight Handling - Container Batch',
        quantity: 8,
        unitPrice: 2100,
        taxAmount: 2520,
        lineTotal: 16800,
      },
    ],
    subtotal: 16800,
    taxTotal: 2520,
    total: 19320,
    currency: 'ZAR',
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];
