import { describe, it, expect, beforeEach } from 'vitest';
import { MockJournalEntryRepository } from './MockJournalEntryRepository';
import { seedJournalEntries } from '@/mock-data/journalEntries';
import type { JournalEntry } from '@/types';

describe('MockJournalEntryRepository', () => {
  let repository: MockJournalEntryRepository;

  beforeEach(() => {
    repository = new MockJournalEntryRepository();
  });

  describe('getAll', () => {
    it('returns all seeded entries', async () => {
      const entries = await repository.getAll();
      expect(entries.length).toBe(seedJournalEntries.length);
    });

    it('returns a copy, not the original seed array or lines', async () => {
      const entries = await repository.getAll();
      expect(entries).not.toBe(seedJournalEntries);
      entries[0].lines.push({ id: 'tampered', accountId: 'acc_1000', debit: 1, credit: 0 });
      const entriesAgain = await repository.getAll();
      expect(entriesAgain[0].lines.some((l) => l.id === 'tampered')).toBe(false);
    });
  });

  describe('getById', () => {
    it('returns an entry by id', async () => {
      const entry = await repository.getById(seedJournalEntries[0].id);
      expect(entry?.id).toBe(seedJournalEntries[0].id);
    });

    it('returns undefined for a non-existent id', async () => {
      expect(await repository.getById('nope')).toBeUndefined();
    });
  });

  describe('create', () => {
    it('appends a new posted entry and assigns an id/timestamps', async () => {
      const draft: JournalEntry = {
        id: '',
        entryNumber: 'JE-9999',
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        status: 'posted',
        lines: [
          { id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 },
          { id: 'l2', accountId: 'acc_3000', debit: 0, credit: 100 },
        ],
        createdAt: '',
        updatedAt: '',
      };

      const created = await repository.create(draft);
      expect(created.id).toBeTruthy();
      expect(created.createdAt).toBeTruthy();

      const all = await repository.getAll();
      expect(all.length).toBe(seedJournalEntries.length + 1);
    });

    // This is the load-bearing assertion for the whole "immutable ledger"
    // design: the type system itself must refuse an update/delete call,
    // not just convention. There is no update()/delete() to call here.
    it('exposes no update or delete method', () => {
      expect((repository as unknown as { update?: unknown }).update).toBeUndefined();
      expect((repository as unknown as { delete?: unknown }).delete).toBeUndefined();
    });

    // Storage-layer enforcement (docs/KNOWN_ISSUES.md): this must reject an
    // unbalanced entry even if JournalEntryService.validateLines() were
    // somehow bypassed — the repository re-checks independently.
    it('refuses to persist an unbalanced entry', async () => {
      const unbalanced: JournalEntry = {
        id: '',
        entryNumber: 'JE-9998',
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        status: 'posted',
        lines: [
          { id: 'l1', accountId: 'acc_1000', debit: 100, credit: 0 },
          { id: 'l2', accountId: 'acc_3000', debit: 0, credit: 90 },
        ],
        createdAt: '',
        updatedAt: '',
      };

      await expect(repository.create(unbalanced)).rejects.toThrow(/unbalanced/i);
      const all = await repository.getAll();
      expect(all.length).toBe(seedJournalEntries.length);
    });
  });

  describe('constructor', () => {
    it('refuses to construct with unbalanced seed data', () => {
      const badSeed: JournalEntry[] = [
        {
          id: 'je_bad',
          entryNumber: 'JE-0000',
          date: '2026-01-01T00:00:00.000Z',
          source: 'manual',
          status: 'posted',
          lines: [{ id: 'l1', accountId: 'acc_1000', debit: 50, credit: 0 }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      expect(() => new MockJournalEntryRepository(badSeed)).toThrow(/unbalanced/i);
    });
  });
});
