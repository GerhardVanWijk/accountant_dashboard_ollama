import type { DebitCredit, ID } from '@/types';

/** Supported bank-statement file formats for import. */
export type StatementFileFormat = 'ofx' | 'csv' | 'qif' | 'mt940';

/**
 * One transaction line parsed out of an imported statement file, before it
 * becomes a BankStatementLine / BankTransaction. Kept separate from those
 * because a parsed line hasn't been persisted, allocated to a GL account, or
 * matched yet — see src/features/banking/utils/statementParsers.ts.
 */
export interface ParsedStatementLine {
  /**
   * Stable id derived from the source row, always present. Used as the React
   * key and selection handle in the import UI, and as the fallback dedup key
   * when the format carries no real external reference.
   */
  sourceRowId: string;
  /**
   * The line's own external identity from the source file — OFX `<FITID>`,
   * the MT940 owner/bank reference, or (for CSV/QIF with no ref column) the
   * synthetic `sourceRowId`. This is what a re-import matches against for
   * idempotency (`bank_statement_lines.external_ref_id`).
   */
  externalRefId?: string;
  /** Transaction / entry date, ISO. */
  date: string;
  /** Value date, when the format supplies one distinct from the entry date (MT940). */
  valueDate?: string;
  description: string;
  reference?: string;
  amount: number;
  direction: DebitCredit;
  /** Running account balance after this line, when the format supplies it (MT940, some CSV). */
  runningBalance?: number;
  /**
   * Verbatim parsed source row — every field the parser saw, never discarded,
   * retained for audit / re-parsing (`bank_statement_lines.raw_source`).
   */
  raw: Record<string, unknown>;
}

/** A row the parser could not turn into a `ParsedStatementLine`. Parsing continues past it. */
export interface StatementParseError {
  /** 0-based index of the offending row within the file's own row sequence. */
  rowIndex: number;
  /** The raw text (or serialised block) of the row that failed. */
  raw: string;
  /** Why it could not be parsed. */
  reason: string;
}

/**
 * The full result of parsing one statement file: the lines that parsed, the
 * statement-level metadata the format carried (opening/closing balance,
 * period), and a per-row error list. A malformed row lands in `parseErrors`
 * and parsing continues — only a fundamentally unparseable file throws.
 */
export interface ParsedStatement {
  lines: ParsedStatementLine[];
  /** Opening balance as stated by the file (MT940 `:60F:`/`:60M:`). `undefined` = not in the file. */
  openingBalance?: number;
  /** Closing balance as stated by the file (MT940 `:62F:`/`:62M:`, OFX `<LEDGERBAL><BALAMT>`). */
  closingBalance?: number;
  /** Statement period start (MT940 `:60F:` date, OFX `<DTSTART>`). */
  periodStart?: string;
  /** Statement period end (MT940 `:62F:` date, OFX `<DTEND>`). */
  periodEnd?: string;
  format: StatementFileFormat;
  parseErrors: StatementParseError[];
}

/** A candidate existing BankTransaction that a parsed statement line might already correspond to. */
export interface MatchCandidate {
  transactionId: ID;
  score: number;
  reasons: string[];
}
