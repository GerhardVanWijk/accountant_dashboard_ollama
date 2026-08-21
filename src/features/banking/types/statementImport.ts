import type { DebitCredit, ID } from '@/types';

/** Supported bank-statement file formats for import. */
export type StatementFileFormat = 'ofx' | 'csv' | 'qif' | 'mt940';

/**
 * One transaction line parsed out of an imported statement file, before it
 * becomes a BankTransaction. Kept separate from BankTransaction because a
 * parsed line hasn't been allocated to a GL account or matched yet — see
 * src/features/banking/utils/statementParsers.ts.
 */
export interface ParsedStatementLine {
  /** Stable id derived from the source row, used for de-duplication on repeat import. */
  sourceRowId: string;
  date: string;
  description: string;
  reference?: string;
  amount: number;
  direction: DebitCredit;
}

/** A candidate existing BankTransaction that a parsed statement line might already correspond to. */
export interface MatchCandidate {
  transactionId: ID;
  score: number;
  reasons: string[];
}
