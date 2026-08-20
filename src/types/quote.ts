import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface Quote extends BaseEntity {
  quoteNumber: string;
  customerId: ID;
  issueDate: ISODateString;
  expiryDate: ISODateString;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  currency: CurrencyCode;
  status: QuoteStatus;
  notes?: string;
}
