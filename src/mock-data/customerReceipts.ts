import type { CustomerReceipt } from '@/types';

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Seed data for the Customer Receipts list. Recording a receipt posts a
 * balanced journal entry (debit Cash/Bank, credit Accounts Receivable) at
 * creation time — see
 * `src/features/sales/services/customerReceiptService.ts` and
 * docs/LEDGER_ARCHITECTURE.md. Seed rows carry no real `journalEntryId`
 * (no journal entries are seeded for these) since they were never posted
 * through the live posting path — recording a new one through the UI posts
 * a genuine journal entry via journalEntryService.
 */
export const seedCustomerReceipts: CustomerReceipt[] = [
  {
    id: 'rcpt_00000001',
    receiptNumber: 'RCT-2026-0001',
    customerId: 'cust_00000001',
    date: '2026-08-01T00:00:00.000Z',
    method: 'eft',
    reference: 'EFT-90210',
    amount: 9200,
    allocations: [{ invoiceId: 'inv_00000001', amount: 9200 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'rcpt_00000002',
    receiptNumber: 'RCT-2026-0002',
    customerId: 'cust_00000002',
    date: '2026-08-06T00:00:00.000Z',
    method: 'card',
    amount: 1500,
    allocations: [{ invoiceId: 'inv_00000002', amount: 1500 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'rcpt_00000003',
    receiptNumber: 'RCT-2026-0003',
    customerId: 'cust_00000006',
    date: '2026-08-15T00:00:00.000Z',
    method: 'cash',
    amount: 2000,
    allocations: [],
    unallocatedAmount: 2000,
    currency: 'ZAR',
    notes: 'Payment on account, invoice not yet issued.',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];
