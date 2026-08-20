import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void';

/** A sales tax invoice (Accounts Receivable). */
export interface Invoice extends BaseEntity {
  invoiceNumber: string;
  customerId: ID;
  salesOrderId?: ID;
  issueDate: ISODateString;
  dueDate: ISODateString;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  currency: CurrencyCode;
  status: InvoiceStatus;
  notes?: string;
}
