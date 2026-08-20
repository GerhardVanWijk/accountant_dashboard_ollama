import type { BaseEntity, DebitCredit, ID } from './common';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/** A Chart of Accounts entry (general ledger account). */
export interface Account extends BaseEntity {
  code: string;
  name: string;
  type: AccountType;
  subType?: string;
  parentAccountId?: ID;
  normalBalance: DebitCredit;
  isActive: boolean;
  description?: string;
}
