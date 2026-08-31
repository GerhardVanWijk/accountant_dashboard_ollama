import type { BaseEntity, ID, ISODateString } from './common';

export type StockTransferStatus = 'draft' | 'in_transit' | 'completed' | 'cancelled';

export interface StockTransferLine {
  id: ID;
  transferId: ID;
  productId: ID;
  quantity: number;
  /** Weighted-average cost captured at dispatch. */
  unitCost: number;
  totalCost: number;
}

export type StockTransferHeader = Omit<StockTransfer, 'lineItems'>;
export type NewStockTransferLine = Omit<StockTransferLine, 'id' | 'transferId'> & { id?: ID };

/**
 * An inter-warehouse stock transfer (migration 0027). Lifecycle:
 * `draft → in_transit → completed` (or `cancelled`). Company-wide inventory
 * value is unchanged by a transfer; when the in-transit leg is used it posts
 * DR 1210 Inventory in Transit / CR 1200 on dispatch and the reverse on
 * receipt. Generates `transfer_out` then `transfer_in` movements.
 */
export interface StockTransfer extends BaseEntity {
  transferNumber: string;
  fromWarehouseId: ID;
  toWarehouseId: ID;
  transferDate: ISODateString;
  expectedReceiptDate?: ISODateString;
  receivedDate?: ISODateString;
  notes?: string;
  lineItems: StockTransferLine[];
  totalCost: number;
  status: StockTransferStatus;
  dispatchedJournalEntryId?: ID;
  receivedJournalEntryId?: ID;
}
