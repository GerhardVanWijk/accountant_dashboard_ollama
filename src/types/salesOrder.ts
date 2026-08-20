import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

export type SalesOrderStatus = 'pending' | 'confirmed' | 'fulfilled' | 'cancelled';

export interface SalesOrder extends BaseEntity {
  orderNumber: string;
  customerId: ID;
  quoteId?: ID;
  orderDate: ISODateString;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  currency: CurrencyCode;
  status: SalesOrderStatus;
  notes?: string;
}
