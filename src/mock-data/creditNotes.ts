import type { CreditNote } from '@/types';
import { STANDARD_RATE_ID } from './taxRates';
import { seedJournalEntryId } from './seedJournalEntryId';

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Seed data for the Credit Notes list. Issuing a credit note posts a
 * balanced journal entry (reverse of an Invoice posting) — see
 * `src/features/sales/services/creditNoteService.ts` and
 * docs/LEDGER_ARCHITECTURE.md. All three seed rows are 'draft' —
 * issuing one for real happens through the UI, which posts a genuine
 * journal entry via journalEntryService. If a future seed row is added
 * non-draft, it automatically gets a matching `journalEntryId` below
 * (generateSeedPostings.ts generates the corresponding JournalEntry) —
 * same pattern as seedInvoices/seedBills.
 */
const rawSeedCreditNotes: CreditNote[] = [
  {
    id: 'cn_00000001',
    creditNoteNumber: 'CN-2026-0001',
    customerId: 'cust_00000002',
    invoiceId: 'inv_00000002',
    issueDate: '2026-08-10T00:00:00.000Z',
    reason: 'pricing_error',
    lineItems: [
      {
        id: 'li_cn_00000001',
        description: 'Price correction - IT Support overcharge',
        quantity: 1,
        unitPrice: 300,
        taxRateId: STANDARD_RATE_ID,
        taxAmount: 45,
        lineTotal: 300,
      },
    ],
    subtotal: 300,
    taxTotal: 45,
    total: 345,
    amountAllocated: 0,
    currency: 'ZAR',
    status: 'draft',
    allocations: [],
    notes: 'Billing correction agreed with customer on call.',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'cn_00000002',
    creditNoteNumber: 'CN-2026-0002',
    customerId: 'cust_00000004',
    invoiceId: 'inv_00000004',
    issueDate: '2026-08-14T00:00:00.000Z',
    reason: 'return',
    lineItems: [
      {
        id: 'li_cn_00000002',
        description: 'Returned goods - damaged in transit',
        quantity: 2,
        unitPrice: 750,
        taxRateId: STANDARD_RATE_ID,
        taxAmount: 225,
        lineTotal: 1500,
      },
    ],
    subtotal: 1500,
    taxTotal: 225,
    total: 1725,
    amountAllocated: 0,
    currency: 'ZAR',
    status: 'draft',
    allocations: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'cn_00000003',
    creditNoteNumber: 'CN-2026-0003',
    customerId: 'cust_00000003',
    issueDate: '2026-07-20T00:00:00.000Z',
    reason: 'discount',
    lineItems: [
      {
        id: 'li_cn_00000003',
        description: 'Loyalty discount - Q3 volume rebate',
        quantity: 1,
        unitPrice: 500,
        taxRateId: STANDARD_RATE_ID,
        taxAmount: 75,
        lineTotal: 500,
      },
    ],
    subtotal: 500,
    taxTotal: 75,
    total: 575,
    amountAllocated: 0,
    currency: 'ZAR',
    status: 'draft',
    allocations: [],
    notes: 'Standalone account credit, not tied to a specific invoice.',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];

export const seedCreditNotes: CreditNote[] = rawSeedCreditNotes.map((creditNote) =>
  creditNote.status === 'draft' || creditNote.status === 'void'
    ? creditNote
    : { ...creditNote, journalEntryId: seedJournalEntryId(creditNote.id) },
);
