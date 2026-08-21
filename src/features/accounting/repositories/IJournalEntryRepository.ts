import type { ID, JournalEntry } from '@/types';

/**
 * Append-only general ledger contract — deliberately NARROWER than the
 * generic IRepository<T>, the same shape as inventory's
 * IStockMovementRepository. Journal entries are immutable once created
 * (docs/LEDGER_ARCHITECTURE.md): a correction is posted as a new reversing
 * entry (see JournalEntryService.reverseJournalEntry), never as an edit to
 * an existing row. This interface has no update()/delete() at all, so a
 * caller cannot even attempt to mutate ledger history.
 */
export interface IJournalEntryRepository {
  getAll(): Promise<JournalEntry[]>;
  getById(id: ID): Promise<JournalEntry | undefined>;
  create(entity: JournalEntry): Promise<JournalEntry>;
}
