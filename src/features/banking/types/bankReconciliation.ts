import type { BaseEntity, ID, ISODateString } from '@/types';

/**
 * An immutable snapshot of a completed bank reconciliation
 * (docs/SA_ACCOUNTING_MASTER_SPEC.md — bank reconciliation control). Created
 * ONLY by BankReconciliationService.finalizeReconciliation(), which refuses
 * to create one while `variance !== 0` (enforced service-side, not just in
 * the UI). Once created it is never edited — the same append-only,
 * tamper-evident pattern as JournalEntry (docs/LEDGER_ARCHITECTURE.md) and
 * AuditLogEntry: IBankReconciliationRepository has no update()/delete().
 */
export interface BankReconciliation extends BaseEntity {
  bankAccountId: ID;
  /** The date printed on the bank statement being reconciled against. */
  statementDate: ISODateString;
  /** Closing balance per the bank statement. */
  statementBalance: number;
  /** GL cashbook balance for this bank account as of statementDate. */
  glCashbookBalance: number;
  /** Adjusted bank balance = statementBalance + uncleared deposits − unpresented payments. */
  adjustedBankBalance: number;
  /** glCashbookBalance − adjustedBankBalance. Must be 0 (within BALANCE_EPSILON) to finalize. */
  variance: number;
  /** Ids of every BankTransaction marked cleared/reconciled in this reconciliation run. */
  clearedTransactionIds: ID[];
  /** Ids of transactions still outstanding (unpresented payments) as of this snapshot, for audit trail. */
  unpresentedTransactionIds: ID[];
  /** Ids of transactions still outstanding (uncleared deposits) as of this snapshot, for audit trail. */
  unclearedDepositIds: ID[];
  finalizedAt: ISODateString;
  finalizedByUserId: ID;
  notes?: string;
}
