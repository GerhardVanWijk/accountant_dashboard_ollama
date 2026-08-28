import { describe, it, expect } from 'vitest';
import type { JournalEntry } from '@/types';
import { AccountService } from './accountService';
import { MockAccountRepository } from '../repositories/MockAccountRepository';
import { MockJournalEntryRepository } from '../repositories/MockJournalEntryRepository';

function entry(id: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
  return {
    id,
    entryNumber: id,
    date: '2026-08-01',
    status: 'posted',
    source: 'manual',
    lines: lines.map((l, i) => ({ id: `${id}_${i}`, ...l })),
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('AccountService.getAccountIdsWithPostings', () => {
  it('returns the distinct set of account ids referenced by any journal line, in one ledger pass', async () => {
    const journal = new MockJournalEntryRepository([
      entry('JE-1', [
        { accountId: 'acc_1000', debit: 100, credit: 0 },
        { accountId: 'acc_4000', debit: 0, credit: 100 },
      ]),
      entry('JE-2', [
        { accountId: 'acc_1000', debit: 0, credit: 40 },
        { accountId: 'acc_5000', debit: 40, credit: 0 },
      ]),
    ]);
    const service = new AccountService(new MockAccountRepository(), journal);

    const ids = await service.getAccountIdsWithPostings();

    expect(ids).toEqual(new Set(['acc_1000', 'acc_4000', 'acc_5000']));
  });

  it('is empty when nothing has been posted', async () => {
    const service = new AccountService(new MockAccountRepository(), new MockJournalEntryRepository([]));
    expect(await service.getAccountIdsWithPostings()).toEqual(new Set());
  });

  it('agrees with hasPostings() for every account', async () => {
    const journal = new MockJournalEntryRepository([
      entry('JE-1', [
        { accountId: 'acc_1000', debit: 100, credit: 0 },
        { accountId: 'acc_4000', debit: 0, credit: 100 },
      ]),
    ]);
    const service = new AccountService(new MockAccountRepository(), journal);
    const set = await service.getAccountIdsWithPostings();

    expect(set.has('acc_1000')).toBe(await service.hasPostings('acc_1000'));
    expect(set.has('acc_9999')).toBe(await service.hasPostings('acc_9999'));
  });
});
