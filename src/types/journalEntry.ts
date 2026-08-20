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
}
