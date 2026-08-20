import type { ActiveStatus, BaseEntity, CurrencyCode, ID } from './common';

export type BankAccountType = 'checking' | 'savings' | 'credit_card' | 'cash';

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
}
