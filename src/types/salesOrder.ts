import type { BaseEntity, CurrencyCode, DocumentLineItem, ID, ISODateString } from './common';

/**
 * Commercial lifecycle of a Sales Order. Fulfilment / invoicing PROGRESS is
 * derived, never stored (see `src/features/sales/utils/salesOrderFulfilment.ts`).
 *
 * - `pending`   — raised, not yet confirmed by the customer. No stock commitment.
 * - `confirmed` — a real commitment. Commits its remaining un-fulfilled quantity.
 * - `fulfilled` — every line fully covered by POSTED invoices (set at post time,
 *   or a pre-5B.1 legacy conversion). Commits nothing.
 * - `closed`    — the business intentionally ABANDONED the un-invoiced remainder
 *   (Phase 5B). NOT the same as `fulfilled` — the ordered quantity was never all
 *   supplied. No GL / stock / invoice effect; commits nothing.
 * - `cancelled` — the whole order was called off before anything was invoiced.
 */
export type SalesOrderStatus = 'pending' | 'confirmed' | 'fulfilled' | 'closed' | 'cancelled';

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
