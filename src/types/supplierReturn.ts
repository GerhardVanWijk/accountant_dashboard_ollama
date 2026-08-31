import type { BaseEntity, ID, ISODateString } from './common';

export type SupplierReturnStatus = 'draft' | 'posted' | 'cancelled';

export interface SupplierReturnLine {
  id: ID;
  supplierReturnId: ID;
  productId: ID;
  warehouseId?: ID;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRateId?: ID;
  /** Stable identity of the originating bill/PO line when the return is source-linked. */
  sourceDocumentLineId?: ID;
  /** Original receipt movement reversed by this return line. */
  sourceStockMovementId?: ID;
  taxAmount: number;
  lineTotal: number;
}

export type SupplierReturnHeader = Omit<SupplierReturn, 'lineItems'>;
export type NewSupplierReturnLine = Omit<SupplierReturnLine, 'id' | 'supplierReturnId'> & { id?: ID };

/**
 * A return of goods to a supplier — the purchase-return path that did not exist
 * before (migration 0029). Draft-then-post; posting reverses the inventory
 * capitalisation and input VAT
 * (DR Accounts Payable or GRNI / CR 1200 Inventory / CR 2110 VAT Input) and
 * generates `purchase_return` movements.
 */
export interface SupplierReturn extends BaseEntity {
  returnNumber: string;
  supplierId: ID;
  billId?: ID;
  purchaseOrderId?: ID;
  returnDate: ISODateString;
  reason?: string;
  lineItems: SupplierReturnLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  status: SupplierReturnStatus;
  journalEntryId?: ID;
  notes?: string;
}
