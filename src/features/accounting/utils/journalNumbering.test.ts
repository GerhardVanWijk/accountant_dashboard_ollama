import { describe, it, expect } from 'vitest';
import {
  deriveNextJournalEntryNumber,
  formatJournalEntryNumber,
  highestJournalOrdinal,
} from './journalNumbering';
import { MockJournalEntryRepository } from '../repositories/MockJournalEntryRepository';
import type { JournalEntry } from '@/types';

function entry(entryNumber: string): JournalEntry {
  return {
    id: `id-${entryNumber || 'x'}`,
    entryNumber,
    date: '2026-01-01T00:00:00.000Z',
    source: 'test',
    status: 'posted',
    currency: 'ZAR',
    lines: [
      { id: 'a', accountId: 'acc-1', debit: 10, credit: 0 },
      { id: 'b', accountId: 'acc-2', debit: 0, credit: 10 },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('journalNumbering — the ONE rule (mirrors migration 0033 allocate_journal_number)', () => {
  it('empty ledger → JE-0001', () => {
    expect(deriveNextJournalEntryNumber([])).toBe('JE-0001');
  });

  it('contiguous history → next ordinal', () => {
    expect(deriveNextJournalEntryNumber(['JE-0001', 'JE-0002', 'JE-0003'])).toBe('JE-0004');
  });

  it('a GAP does not re-issue a live number — uses the high-water mark, not count+1', () => {
    // JE-0002 was deleted; count()+1 would give JE-0003 (collides with the live JE-0003).
    expect(deriveNextJournalEntryNumber(['JE-0001', 'JE-0003', 'JE-0004'])).toBe('JE-0005');
  });

  it('ignores non-standard historic numbers for the high-water mark', () => {
    expect(highestJournalOrdinal(['OPENING', 'REV-2003', '', 'JE-0007', 'manual'])).toBe(7);
    expect(deriveNextJournalEntryNumber(['OPENING', 'REV-2003', 'JE-0007'])).toBe('JE-0008');
  });

  it('only non-standard numbers → starts at JE-0001', () => {
    expect(deriveNextJournalEntryNumber(['OPENING', 'ADJ-1'])).toBe('JE-0001');
  });

  it('tolerates leading zeros and larger ordinals', () => {
    expect(highestJournalOrdinal(['JE-0099', 'JE-0100', 'JE-12345'])).toBe(12345);
    expect(formatJournalEntryNumber(12346)).toBe('JE-12346');
  });
});

describe('MockJournalEntryRepository — assigns the number at the storage boundary', () => {
  it('assigns JE-0001.. for blank entryNumbers and fills blank line ids', async () => {
    const repo = new MockJournalEntryRepository([]);
    const a = await repo.create({ ...entry(''), lines: entry('').lines.map((l) => ({ ...l, id: '' })) });
    const b = await repo.create({ ...entry(''), lines: entry('').lines.map((l) => ({ ...l, id: '' })) });
    expect(a.entryNumber).toBe('JE-0001');
    expect(b.entryNumber).toBe('JE-0002');
    expect(a.lines[0].id).toBe('JE-0001_0');
    expect(a.lines[1].id).toBe('JE-0001_1');
  });

  it('respects an explicitly supplied number (seed / fixture) and never lowers the sequence', async () => {
    const repo = new MockJournalEntryRepository([entry('JE-0001'), entry('JE-0005')]);
    const next = await repo.create(entry(''));
    expect(next.entryNumber).toBe('JE-0006'); // high-water mark 5 + 1, not count 2 + 1
  });

  it('is independent per repository instance (company scoped in the DB allocator)', async () => {
    const companyA = new MockJournalEntryRepository([entry('JE-0009')]);
    const companyB = new MockJournalEntryRepository([]);
    expect((await companyA.create(entry(''))).entryNumber).toBe('JE-0010');
    expect((await companyB.create(entry(''))).entryNumber).toBe('JE-0001');
  });

  it('a burst of creates yields a strictly increasing, gapless, unique sequence', async () => {
    const repo = new MockJournalEntryRepository([]);
    const created = await Promise.all(Array.from({ length: 25 }, () => repo.create(entry(''))));
    const numbers = created.map((e) => e.entryNumber).sort();
    expect(new Set(numbers).size).toBe(25);
    expect(numbers[0]).toBe('JE-0001');
    expect(numbers[24]).toBe('JE-0025');
  });
});
