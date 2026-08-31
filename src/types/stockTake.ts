import type { BaseEntity, ID, ISODateString } from './common';

export type StockTakeStatus = 'draft' | 'counting' | 'ready_for_review' | 'posted' | 'cancelled';

/** What the count covers. */
export type StockTakeScope = 'all' | 'category' | 'items';

export interface StockTakeScopeRef {
  categoryId?: ID;
  productIds?: ID[];
}

/**
 * One line on a stock-take count sheet. `expectedQty` is snapshotted when the
 * take is frozen; `countedQty` is entered/imported during counting.
 * `varianceQty = countedQty − expectedQty`; `varianceValue = varianceQty × unitCost`.
 */
export interface StockTakeLine {
  id: ID;
  stockTakeId: ID;
  productId: ID;
  warehouseId: ID;
  expectedQty: number;
  countedQty?: number;
  /** Weighted-average cost at freeze time — used to value the variance. */
  unitCost: number;
  varianceQty: number;
  varianceValue: number;
  reason?: string;
}

export type StockTakeHeader = Omit<StockTake, 'lineItems'>;
export type NewStockTakeLine = Omit<StockTakeLine, 'id' | 'stockTakeId'> & { id?: ID };

/**
 * A physical stock count (migration 0028). Lifecycle:
 * `draft → counting → ready_for_review → posted` (or `cancelled`).
 * `frozenAt` records when `expectedQty` was snapshotted. Posting generates a
 * `stock_take` movement per non-zero variance line and one balanced GL entry
 * (5050 Inventory Adjustments vs the inventory account for the net variance
 * value). A posted stock take is immutable.
 */
export interface StockTake extends BaseEntity {
  stockTakeNumber: string;
  warehouseId: ID;
  scope: StockTakeScope;
  scopeRef: StockTakeScopeRef;
  countDate: ISODateString;
  frozenAt?: ISODateString;
  lineItems: StockTakeLine[];
  totalVarianceValue: number;
  status: StockTakeStatus;
  notes?: string;
  approvedBy?: ID;
  approvedAt?: ISODateString;
  postedBy?: ID;
  postedAt?: ISODateString;
  journalEntryId?: ID;
}
