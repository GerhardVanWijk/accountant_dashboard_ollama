import type { JournalEntry } from '@/types';
import { seedInvoices } from './invoices';
import { seedBills } from './bills';
import { seedCreditNotes } from './creditNotes';
import { generateSeedPostings } from './generateSeedPostings';

const openingBalanceEntry: JournalEntry = {
  id: 'je_0001',
  entryNumber: 'JE-0001',
  date: '2026-01-01T00:00:00.000Z',
  memo: 'Opening balances',
  status: 'posted',
  postedAt: '2026-01-01T00:00:00.000Z',
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
 * JournalEntry per non-draft/non-void seed Invoice/Bill/Credit Note
 * (generateSeedPostings.ts — mirrors the real postInvoice()/postBill()/
 * issueCreditNote() math) so the seed data's AR/AP/VAT control accounts
 * actually reconcile against the seed documents themselves, rather than
 * every reconciliation report showing a variance purely because these
 * fixtures were never run through the real posting pipeline (see
 * docs/KNOWN_ISSUES.md's prior entry on this, now resolved for postings —
 * payment/receipt allocations are still not backfilled, a separate,
 * narrower remaining gap noted there). Every entry here already satisfies
 * the double-entry invariant enforced by JournalEntryService.validateLines
 * — sum(debit) === sum(credit).
 */
export const seedJournalEntries: JournalEntry[] = [
  openingBalanceEntry,
  ...generateSeedPostings(seedInvoices, seedBills, seedCreditNotes, 2),
];
