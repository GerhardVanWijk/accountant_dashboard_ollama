import type { CustomerReceipt } from '@/types';
import { seedJournalEntryId } from './seedJournalEntryId';

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Seed data for the Customer Receipts list. Recording a receipt posts a
 * balanced journal entry at creation time — Increment 4A split: DR Cash and
 * Bank for the full amount, CR Accounts Receivable for the portion applied
 * to invoices, CR Customer Deposits (acc_2600) for the unapplied portion —
 * see `src/features/sales/services/customerReceiptService.ts` and
 * docs/LEDGER_ARCHITECTURE.md. EVERY row here gets a matching
 * `journalEntryId` pointing at the JournalEntry `generateSeedPostings.ts`
 * produces for it (`src/mock-data/journalEntries.ts`), same pattern as
 * `seedInvoices` — including on-account (unallocated) receipts, whose
 * unapplied balance now sits in a real liability account and reconciles
 * via `reconcileCustomerDeposits()`.
 */
const rawSeedCustomerReceipts: CustomerReceipt[] = [
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
    // Matches inv_00000002's real amountPaid (2875 total / 2 = 1437.50,
    // status 'partially_paid') — was 1500 here, a stale figure that never
    // matched the invoice it claims to have paid down. Found 2026-08-22
    // while backfilling matching GL entries for the AR/AP reconciliation
    // (docs/KNOWN_ISSUES.md).
    amount: 1437.5,
    allocations: [{ invoiceId: 'inv_00000002', amount: 1437.5 }],
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
  // The next three receipts were missing entirely until 2026-08-22, found
  // the same way as the rcpt_00000002 amount mismatch above: three seed
  // invoices (inv_00000006/0008/0014) carried a real amountPaid with no
  // seed CustomerReceipt behind it at all — not just an un-posted one, an
  // un-recorded one. Added to match each invoice's own amountPaid exactly.
  {
    id: 'rcpt_00000004',
    receiptNumber: 'RCT-2026-0004',
    customerId: 'cust_00000001',
    date: '2026-08-10T00:00:00.000Z',
    method: 'eft',
    reference: 'EFT-90344',
    amount: 5520,
    allocations: [{ invoiceId: 'inv_00000006', amount: 5520 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'rcpt_00000005',
    receiptNumber: 'RCT-2026-0005',
    customerId: 'cust_00000003',
    date: '2026-08-18T00:00:00.000Z',
    method: 'eft',
    reference: 'EFT-90398',
    amount: 2875,
    allocations: [{ invoiceId: 'inv_00000008', amount: 2875 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
  {
    id: 'rcpt_00000006',
    receiptNumber: 'RCT-2026-0006',
    customerId: 'cust_00000004',
    date: '2026-08-21T00:00:00.000Z',
    method: 'eft',
    reference: 'EFT-90412',
    amount: 4600,
    allocations: [{ invoiceId: 'inv_00000014', amount: 4600 }],
    unallocatedAmount: 0,
    currency: 'ZAR',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  },
];

export const seedCustomerReceipts: CustomerReceipt[] = rawSeedCustomerReceipts.map((receipt) => ({
  ...receipt,
  journalEntryId: seedJournalEntryId(receipt.id),
}));
