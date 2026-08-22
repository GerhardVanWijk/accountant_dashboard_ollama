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
  /** Set once this PO has been converted to a Bill — guards against converting it twice. */
  billId?: ID;
  /**
   * When `recordReceipt()` actually posted goods received against this PO
   * (SA_ACCOUNTING_MASTER_SPEC.md §22, 3-way PO/GRN/Invoice matching) — the
   * date used for that GL entry. Distinct from `orderDate`/`expectedDate`.
   */
  receivedDate?: ISODateString;
  /**
   * Set once `recordReceipt()` successfully posts DR Inventory / CR GRNI
   * for this PO's tracked-inventory lines. Its presence is what tells
   * `billService.postBill()` a linked Bill must clear GRNI instead of
   * debiting Inventory again, and must not re-record the stock movement —
   * see `docs/LEDGER_ARCHITECTURE.md`. Also the idempotency guard:
   * `recordReceipt()` cannot run twice against the same PO.
   */
  journalEntryId?: ID;
}
