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
  /**
   * What `matchedEntityId` refers to. Was unset by every service until the
   * Leases + Payroll integrity audit (PART 3 — Banking fix, migration
   * 0086). Set exclusively by the atomic, over-settlement-proof RPCs
   * `settle_payroll_net_pay` / `settle_lease_period_payment` (FINAL
   * HARDENING pass, migrations 0096/0097): 'payroll_run' (matchedEntityId
   * -> a PayrollRun's id, one obligation per whole run) or
   * 'lease_amortization_entry' (matchedEntityId -> a
   * LeaseAmortizationEntry's id — one specific amortization PERIOD, not
   * the lease as a whole, so a lease's clearing balance is traceable
   * period by period rather than one opaque cumulative figure). Undefined
   * for any other transaction.
   */
  matchedEntityType?: 'payroll_run' | 'lease_amortization_entry';
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
  /**
   * The `BankStatementLine` this transaction was materialised from / matched
   * to, once a first-class statement import exists for it (migration 0020).
   * Additive/optional — every existing `source='import'` row predates the
   * statement entity and simply leaves this unset.
   */
  bankStatementLineId?: ID;
}
