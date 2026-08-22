import type { JournalEntry } from '@/types';
import { seedJournalEntries } from '@/mock-data/journalEntries';
import type { IJournalEntryRepository } from './IJournalEntryRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `je_${Math.random().toString(36).slice(2, 10)}`;
}

/** Half a cent — same rounding tolerance as JournalEntryService's BALANCE_EPSILON. */
const BALANCE_EPSILON = 0.005;

/**
 * Independently re-checks sum(debit) === sum(credit) at the storage
 * boundary — the same invariant JournalEntryService.validateLines()
 * already enforces in application code, re-verified here so this
 * repository can never persist an unbalanced entry even if some future
 * caller bypasses the service (docs/KNOWN_ISSUES.md: "GL posting engine
 * has no storage-layer enforcement"). This is the closest a plain
 * in-memory array can get to a real database's CHECK constraint — a real
 * backend should still enforce this at the DB/transaction layer too, since
 * application code (including this check) can't stop a second writer with
 * direct storage access from bypassing it.
 */
function assertBalanced(entry: JournalEntry): void {
  const totalDebit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = entry.lines.reduce((sum, l) => sum + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > BALANCE_EPSILON) {
    throw new Error(
      `MockJournalEntryRepository refused to store an unbalanced entry "${entry.entryNumber || entry.id}": total debits ${totalDebit.toFixed(2)} !== total credits ${totalCredit.toFixed(2)}. This should be unreachable via JournalEntryService — something bypassed it.`,
    );
  }
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
    initialData.forEach(assertBalanced);
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
    assertBalanced(entity);
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
