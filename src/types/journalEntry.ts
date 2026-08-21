import type { BaseEntity, ID, ISODateString } from './common';

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed';

export interface JournalLine {
  id: ID;
  accountId: ID;
  description?: string;
  debit: number;
  credit: number;
}

/** A double-entry general journal entry. Sum of debits must equal sum of credits. */
export interface JournalEntry extends BaseEntity {
  entryNumber: string;
  date: ISODateString;
  memo?: string;
  lines: JournalLine[];
  status: JournalEntryStatus;
  postedAt?: ISODateString;
  /** Originating source, e.g. "manual", "invoice", "bill", "payment". */
  source: string;
  /**
   * Set only on a reversal entry: the id of the JournalEntry it reverses.
   * A posted entry is never edited to flip its own status to 'reversed' —
   * ledger rows are append-only (docs/LEDGER_ARCHITECTURE.md). Whether an
   * entry has been reversed is answered by asking whether any other entry
   * has reversalOfEntryId === that entry's id, not by mutating a field on
   * the original.
   */
  reversalOfEntryId?: ID;
}
