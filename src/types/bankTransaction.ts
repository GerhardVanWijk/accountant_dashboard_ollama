import type { BaseEntity, DebitCredit, ID, ISODateString } from './common';

export type BankTransactionStatus = 'unreconciled' | 'matched' | 'reconciled';

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
}
