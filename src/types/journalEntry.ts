import type { BaseEntity, CurrencyCode, ID, ISODateString } from './common';

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
  /**
   * The currency every line in this entry is denominated in — a journal
   * entry is single-currency, real-world SA accounting practice for a
   * transaction fully within the functional currency (which is all this
   * app models today, see Company.functionalCurrency,
   * src/types/company.ts). Optional for backward compatibility with older
   * fixtures/seed rows that predate this field; JournalEntryService.
   * postJournalEntry() always sets it (defaulting to the entry poster's
   * configured currency when the caller doesn't specify one) on every new
   * entry, so it is never silently absent going forward — closes
   * docs/KNOWN_ISSUES.md's "GL posting engine has no currency dimension"
   * gap. A future foreign-currency transaction (an invoice raised in USD
   * against a ZAR functional currency, say) would need a per-line
   * transaction-currency + exchange-rate pair and a realized/unrealized FX
   * gain/loss treatment — that translation engine is genuinely Phase 12
   * (Advanced/IFRS) scope, not attempted here; this field only makes the
   * SINGLE-currency case explicit instead of implicit.
   */
  currency?: CurrencyCode;
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
