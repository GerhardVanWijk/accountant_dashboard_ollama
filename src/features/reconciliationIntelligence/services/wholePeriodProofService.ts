import type { ID } from '@/types';
import type { InvestigationCandidate } from '../types';
import { classifyMatches } from '../utils/matching';
import { findSubsetsSumming } from '../utils/subsetSum';
import { daysBetween } from '../utils/textMatching';

/**
 * PART I — the whole-period proof. Two independent sweeps over the
 * reconciliation window, in BOTH directions, so nothing on either side is
 * silently assumed to be accounted for:
 *
 *   statement → books: every `bank_statement_line` — does an accounting
 *   counterpart exist? Surfaces omitted books entries (bank fees, interest,
 *   debit orders nobody recorded).
 *
 *   books → statement: every bank-related accounting entry — does a
 *   statement line exist? Surfaces outstanding payments/deposits, duplicate
 *   books entries, wrong-date and wrong-bank-account postings.
 *
 * Pure — the caller supplies the already-built candidate pools (same ones
 * the investigator uses), this does no I/O.
 */

const OUTSTANDING_TIMING_DAYS = 7;

export interface StatementToBooksItem {
  lineId: ID;
  hasCounterpart: boolean;
  counterpartType?: 'bank_transaction' | 'journal_entry';
  counterpartId?: ID;
  reason: 'matched' | 'grouped' | 'none';
}

export interface BooksToStatementItem {
  booksId: ID;
  booksType: 'bank_transaction' | 'journal_entry';
  hasStatementLine: boolean;
  counterpartLineId?: ID;
  reason: 'matched' | 'grouped' | 'outstanding_timing' | 'duplicate' | 'wrong_account' | 'none';
}

export interface WholePeriodProof {
  windowStart: string;
  windowEnd: string;
  statementToBooks: {
    total: number;
    withCounterpart: number;
    withoutCounterpart: number;
    items: StatementToBooksItem[];
  };
  booksToStatement: {
    total: number;
    withStatementLine: number;
    withoutStatementLine: number;
    items: BooksToStatementItem[];
  };
}

export interface ProveWholePeriodInput {
  windowStart: string;
  windowEnd: string;
  /** The bank side — statement-line candidates (utils/candidates.buildBankSideCandidatesFromStatementLines). */
  statementLineCandidates: InvestigationCandidate[];
  /** The books side — this account's non-import bank_transactions + orphaned GL lines. */
  booksCandidates: InvestigationCandidate[];
  /** Optional: bank-side candidates on every OTHER account, to spot wrong-bank-account postings. */
  otherAccountCandidates?: InvestigationCandidate[];
}

const booksTypeOf = (c: InvestigationCandidate): 'bank_transaction' | 'journal_entry' =>
  c.kind === 'journal_entry' ? 'journal_entry' : 'bank_transaction';

export function proveWholePeriod(input: ProveWholePeriodInput): WholePeriodProof {
  const { windowStart, windowEnd, statementLineCandidates, booksCandidates } = input;
  const otherAccountCandidates = input.otherAccountCandidates ?? [];

  const { confirmed, probable } = classifyMatches(statementLineCandidates, booksCandidates);
  const pairs = [...confirmed, ...probable];
  const matchedLineToBooks = new Map<string, InvestigationCandidate>();
  const matchedBooksToLine = new Map<string, InvestigationCandidate>();
  for (const p of pairs) {
    matchedLineToBooks.set(p.bank.id, p.books);
    matchedBooksToLine.set(p.books.id, p.bank);
  }

  // ---- statement -> books ----
  const unmatchedBooksForGroup = booksCandidates.filter((b) => !matchedBooksToLine.has(b.id));
  const statementItems: StatementToBooksItem[] = statementLineCandidates.map((line) => {
    const direct = matchedLineToBooks.get(line.id);
    if (direct) {
      return {
        lineId: line.id,
        hasCounterpart: true,
        counterpartType: booksTypeOf(direct),
        counterpartId: direct.journalEntryId ?? direct.bankTransactionId ?? direct.id,
        reason: 'matched',
      };
    }
    // A single line that equals the sum of several books entries (one deposit = many receipts).
    const sameDirectionBooks = unmatchedBooksForGroup.filter((b) => Math.sign(b.amountCents) === Math.sign(line.amountCents));
    const group = findSubsetsSumming(sameDirectionBooks, line.amountCents, 1).find((m) => m.indexes.length >= 2);
    if (group) {
      return { lineId: line.id, hasCounterpart: true, reason: 'grouped' };
    }
    return { lineId: line.id, hasCounterpart: false, reason: 'none' };
  });

  // ---- books -> statement ----
  const matchedLineIds = new Set(pairs.map((p) => p.bank.id));
  const bookItems: BooksToStatementItem[] = booksCandidates.map((books) => {
    const direct = matchedBooksToLine.get(books.id);
    if (direct) {
      return { booksId: books.id, booksType: booksTypeOf(books), hasStatementLine: true, counterpartLineId: direct.id, reason: 'matched' };
    }

    // Part of a many-books-to-one-line group?
    const sameDirLines = statementLineCandidates.filter(
      (l) => !matchedLineIds.has(l.id) && Math.sign(l.amountCents) === Math.sign(books.amountCents),
    );
    for (const l of sameDirLines) {
      const peers = booksCandidates.filter((b) => b.id !== books.id && !matchedBooksToLine.has(b.id) && Math.sign(b.amountCents) === Math.sign(l.amountCents));
      const grp = findSubsetsSumming([books, ...peers], l.amountCents, 1).find((m) => m.indexes.includes(0) && m.indexes.length >= 2);
      if (grp) return { booksId: books.id, booksType: booksTypeOf(books), hasStatementLine: true, counterpartLineId: l.id, reason: 'grouped' };
    }

    // A duplicate of another books entry that IS on the statement.
    const twin = booksCandidates.find(
      (b) =>
        b.id !== books.id &&
        b.amountCents === books.amountCents &&
        daysBetween(b.date, books.date) <= 3 &&
        matchedBooksToLine.has(b.id),
    );
    if (twin) {
      return { booksId: books.id, booksType: booksTypeOf(books), hasStatementLine: false, reason: 'duplicate' };
    }

    // Same amount/date on another account's statement — posted to the wrong bank account.
    const elsewhere = otherAccountCandidates.find(
      (o) => o.amountCents === books.amountCents && daysBetween(o.date, books.date) <= 3,
    );
    if (elsewhere) {
      return { booksId: books.id, booksType: booksTypeOf(books), hasStatementLine: false, reason: 'wrong_account' };
    }

    // Recent enough to just be in transit.
    if (daysBetween(books.date, windowEnd) <= OUTSTANDING_TIMING_DAYS) {
      return { booksId: books.id, booksType: booksTypeOf(books), hasStatementLine: false, reason: 'outstanding_timing' };
    }

    return { booksId: books.id, booksType: booksTypeOf(books), hasStatementLine: false, reason: 'none' };
  });

  const sWith = statementItems.filter((i) => i.hasCounterpart).length;
  const bWith = bookItems.filter((i) => i.hasStatementLine).length;

  return {
    windowStart,
    windowEnd,
    statementToBooks: {
      total: statementItems.length,
      withCounterpart: sWith,
      withoutCounterpart: statementItems.length - sWith,
      items: statementItems,
    },
    booksToStatement: {
      total: bookItems.length,
      withStatementLine: bWith,
      withoutStatementLine: bookItems.length - bWith,
      items: bookItems,
    },
  };
}
