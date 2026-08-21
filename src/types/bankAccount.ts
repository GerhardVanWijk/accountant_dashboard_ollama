import type { ActiveStatus, BaseEntity, CurrencyCode, ID } from './common';

/**
 * 'checking' === "Current Account" and 'cash' === "Petty Cash" in SA banking
 * terminology (docs/SA_ACCOUNTING_MASTER_SPEC.md) — labels are mapped for
 * display in src/features/banking. 'money_market' and 'foreign_currency' were
 * added by the Banking module (Phase 2 Wave 2) as a backward-compatible
 * widening of this union (existing 4 members unchanged).
 */
export type BankAccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'cash'
  | 'money_market'
  | 'foreign_currency';

export interface BankAccount extends BaseEntity {
  name: string;
  bankName: string;
  accountNumber: string;
  accountType: BankAccountType;
  currency: CurrencyCode;
  openingBalance: number;
  currentBalance: number;
  /** Chart of Accounts ledger account this bank account posts to. */
  glAccountId: ID;
  status: ActiveStatus;
  /**
   * SA bank branch code (universal branch codes for FNB/Standard
   * Bank/Absa/Nedbank/Capitec etc.). Optional for backward compatibility
   * with the original type shape — added by the Banking module (Phase 2
   * Wave 2), same additive-optional-field pattern as
   * JournalEntry.reversalOfEntryId (docs/LEDGER_ARCHITECTURE.md).
   */
  branchCode?: string;
  /** SWIFT/BIC code — mainly relevant for foreign-currency accounts and international transfers. */
  swiftCode?: string;
}
