import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

export type BillStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void';

/** A supplier bill (Accounts Payable). */
export interface Bill extends BaseEntity {
  billNumber: string;
  supplierId: ID;
  purchaseOrderId?: ID;
  issueDate: ISODateString;
  dueDate: ISODateString;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  currency: CurrencyCode;
  status: BillStatus;
  /** Set once postBill() successfully posts the GL entry (debit Expense/VAT Input, credit AP). */
  journalEntryId?: ID;
  notes?: string;
}
