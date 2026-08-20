import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface PurchaseOrder extends BaseEntity {
  poNumber: string;
  supplierId: ID;
  orderDate: ISODateString;
  expectedDate?: ISODateString;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  currency: CurrencyCode;
  status: PurchaseOrderStatus;
  notes?: string;
}
