import type { JournalEntry } from '@/types';
import { seedJournalEntries } from '@/mock-data/journalEntries';
import type { IJournalEntryRepository } from './IJournalEntryRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `je_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of the append-only general ledger
 * (IJournalEntryRepository). Like MockStockMovementRepository, this
 * deliberately does NOT implement the generic IRepository<T> — there is no
 * update()/delete() method to implement, so ledger history cannot be
 * mutated even by mistake. create() is the only write operation.
 */
export class MockJournalEntryRepository implements IJournalEntryRepository {
  private entries: JournalEntry[];

  constructor(initialData: JournalEntry[] = seedJournalEntries) {
    this.entries = initialData.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l })) }));
  }

  async getAll(): Promise<JournalEntry[]> {
    // Deep-enough copy: a caller mutating the returned lines array must
    // never be able to corrupt ledger history held in this store.
    return this.entries.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l })) }));
  }

  async getById(id: string): Promise<JournalEntry | undefined> {
    const entry = this.entries.find((e) => e.id === id);
    return entry ? { ...entry, lines: entry.lines.map((l) => ({ ...l })) } : undefined;
  }

  async create(entity: JournalEntry): Promise<JournalEntry> {
    const now = nowISO();
    const record: JournalEntry = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(record);
    return record;
  }
}
