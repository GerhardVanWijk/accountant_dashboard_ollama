import type { JournalEntry } from '@/types';

/**
 * Seed general ledger: a single opening-balance entry so the Trial Balance
 * and account ledgers have real, balanced data to render/test against
 * rather than an all-zero chart. Every entry here already satisfies the
 * double-entry invariant enforced by JournalEntryService.validateLines —
 * sum(debit) === sum(credit).
 */
export const seedJournalEntries: JournalEntry[] = [
  {
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
  },
];
