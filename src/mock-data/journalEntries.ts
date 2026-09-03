import type { JournalEntry } from '@/types';
import { seedInvoices } from './invoices';
import { seedBills } from './bills';
import { seedCreditNotes } from './creditNotes';
import { seedCustomerReceipts } from './customerReceipts';
import { seedPayments } from './payments';
import { generateSeedPostings } from './generateSeedPostings';

const openingBalanceEntry: JournalEntry = {
  id: 'je_0001',
  entryNumber: 'JE-0001',
  date: '2026-01-01T00:00:00.000Z',
  memo: 'Opening balances',
  status: 'posted',
  postedAt: '2026-01-01T00:00:00.000Z',
  currency: 'ZAR',
  source: 'manual',
  lines: [
    { id: 'jel_0001_1', accountId: 'acc_1000', description: 'Opening cash balance', debit: 50000, credit: 0 },
    { id: 'jel_0001_2', accountId: 'acc_1200', description: 'Opening inventory balance', debit: 15000, credit: 0 },
    { id: 'jel_0001_3', accountId: 'acc_3000', description: "Owner's opening contribution", debit: 0, credit: 65000 },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Seed general ledger: the opening-balance entry, plus one generated
 * JournalEntry per non-draft/non-void seed Invoice/Bill/Credit Note AND
 * per seed CustomerReceipt and per fully-allocated seed Payment
 * (generateSeedPostings.ts — mirrors the real postInvoice()/postBill()/
 * issueCreditNote()/recordReceipt()/createPayment() math) so the seed
 * data's AR/AP/VAT/Customer-Deposits control accounts actually reconcile
 * against the seed documents themselves, rather than every reconciliation
 * report showing a variance purely because these fixtures were never run
 * through the real posting pipeline (see docs/KNOWN_ISSUES.md's Resolved
 * section). Increment 4A: the one seed receipt left genuinely unallocated
 * (money on account) is now posted too — its unapplied balance credits
 * Customer Deposits (acc_2600), a contract liability. Every entry here
 * already satisfies the double-entry
 * invariant enforced by JournalEntryService.validateLines — sum(debit) ===
 * sum(credit) — and, since 2026-08-22, independently re-checked at the
 * storage layer by MockJournalEntryRepository too.
 */
export const seedJournalEntries: JournalEntry[] = [
  openingBalanceEntry,
  ...generateSeedPostings(seedInvoices, seedBills, seedCreditNotes, 2, undefined, seedCustomerReceipts, seedPayments),
];
