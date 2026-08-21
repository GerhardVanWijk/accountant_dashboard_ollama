import type { BaseEntity, DebitCredit, ID, ISODateString } from './common';

export type BankTransactionStatus = 'unreconciled' | 'matched' | 'reconciled';

/** Where a BankTransaction came from — drives which UI/behaviour applies to it. */
export type BankTransactionSource = 'manual' | 'transfer' | 'import';

export interface BankTransaction extends BaseEntity {
  bankAccountId: ID;
  date: ISODateString;
  description: string;
  reference?: string;
  amount: number;
  direction: DebitCredit;
  status: BankTransactionStatus;
  /** Journal entry or invoice/bill payment this transaction was matched to. */
  matchedEntityId?: ID;
  category?: string;

  /**
   * The following fields were added by the Banking module (Phase 2 Wave 2) —
   * all optional/additive, same backward-compatible pattern as
   * JournalEntry.reversalOfEntryId (docs/LEDGER_ARCHITECTURE.md). Existing
   * consumers of BankTransaction are unaffected.
   */

  /** 'manual' (direct payment/receipt), 'transfer' (inter-account leg), or 'import' (from a statement file). */
  source?: BankTransactionSource;
  /** The JournalEntry this transaction posted to the GL, once GL-posted. */
  journalEntryId?: ID;
  /** For an inter-account transfer: the id of the paired leg on the other bank account. */
  transferPairId?: ID;
  /** Set once this transaction is cleared by a finalized BankReconciliation snapshot — immutable after that. */
  reconciliationId?: ID;
}
