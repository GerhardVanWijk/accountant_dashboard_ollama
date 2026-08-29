import type { BaseEntity, CurrencyCode, DebitCredit, ID, ISODateString } from './common';

/**
 * A first-class imported bank statement — the persistent identity that a
 * batch of `BankStatementLine` rows belongs to. Added by migration 0020
 * (docs/db-changes/0020_bank_statements_and_evidence.sql,
 * docs/BANK_STATEMENT_ARCHITECTURE_AUDIT.md); before it, "an import" was
 * just N loose `BankTransaction` rows with `source='import'` and no way to
 * answer "which lines came from which file".
 *
 * Deliberately a normal mutable CRUD entity, not an append-only snapshot
 * like `reconciliations` — `importStatus` / `reconciliationStatus` are a
 * real lifecycle the statement moves through, not history.
 */

/** Lifecycle of the statement's import: file received -> parsed -> lines materialised as `BankTransaction`s. `reversed` = a completed import that was undone. */
export type BankStatementImportStatus =
  | 'draft'
  | 'parsed'
  | 'imported'
  | 'failed'
  | 'reversed';

/** How far the statement has been reconciled against the general ledger cashbook. */
export type BankStatementReconStatus = 'not_started' | 'in_progress' | 'reconciled';

/**
 * Per-line matching state within a statement.
 * 'unmatched': no ledger/bank-transaction counterpart found yet.
 * 'matched': linked 1:1 to a `BankTransaction` (see `matchedBankTransactionId`).
 * 'explained': difference accounted for by a `ReconciliationIssue`, not a direct match.
 * 'ignored': deliberately excluded from reconciliation by a human.
 */
export type BankStatementLineState = 'unmatched' | 'matched' | 'explained' | 'ignored';

/** Original file format the statement was parsed from. `manual` = keyed in, no source file. */
export type BankStatementSourceFormat = 'csv' | 'ofx' | 'qif' | 'mt940' | 'manual';

export interface BankStatement extends BaseEntity {
  bankAccountId: ID;
  /** Bank-supplied statement number / period label, when the file carries one. */
  reference?: string;
  sourceFilename?: string;
  sourceFormat?: BankStatementSourceFormat;
  periodStart: ISODateString;
  periodEnd: ISODateString;
  /** Opening balance as stated by the bank (MT940 `:60F:`, OFX `<LEDGERBAL>` at `<DTSTART>`). */
  openingBalance: number;
  /** Closing balance as stated by the bank (MT940 `:62F:`, OFX `<LEDGERBAL>` at `<DTEND>`). */
  closingBalance: number;
  currency: CurrencyCode;
  /** Number of `BankStatementLine` rows expected for this statement. */
  lineCount: number;
  importStatus: BankStatementImportStatus;
  reconciliationStatus: BankStatementReconStatus;
  /** Content hash of the source file — dedup key so the same statement is not imported twice. */
  contentHash?: string;
  /** Set once `importStatus` reaches `imported`. */
  importedAt?: ISODateString;
  /** Free-text user id — same shape as `Reconciliation.finalizedByUserId`, not a FK. */
  importedBy?: string;
  /**
   * Result of the `openingBalance + sum(signed line amounts) === closingBalance`
   * check. `undefined` = not checked yet; `false` = the statement does not
   * foot and an integrity warning should be raised (PART L).
   */
  balanceCheckOk?: boolean;
  notes?: string;
}

export interface BankStatementLine extends BaseEntity {
  bankStatementId: ID;
  bankAccountId: ID;
  /** 1-based position within the statement, in file order. */
  sequence: number;
  txnDate: ISODateString;
  /** Value date, when the format supplies one distinct from the transaction date. */
  valueDate?: ISODateString;
  description: string;
  reference?: string;
  /** Stable per-line id from the source (OFX `FITID`, MT940 reference, CSV row id) — enables idempotent re-import. */
  externalRefId?: string;
  /** Magnitude only; sign is carried by `direction`. */
  amount: number;
  /** Reuses the ledger enum — `debit` = money into the account (inflow), per the codebase's inverted-vs-bank convention (see `BankTransaction.direction`). */
  direction: DebitCredit;
  /** Running account balance after this line, when the format supplies it. */
  runningBalance?: number;
  /** Verbatim parsed source row, retained for audit / re-parsing. */
  rawSource: Record<string, unknown>;
  lineState: BankStatementLineState;
  /** Set when `lineState` is `matched` — the `BankTransaction` this line was matched to. */
  matchedBankTransactionId?: ID;
}
