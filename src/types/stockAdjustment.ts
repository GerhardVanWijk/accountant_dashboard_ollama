import type { BaseEntity, ID, ISODateString } from './common';

export type StockAdjustmentStatus = 'draft' | 'pending_approval' | 'posted' | 'cancelled';

export type StockAdjustmentReason =
  | 'write_off'
  | 'shrinkage'
  | 'damage'
  | 'stock_gain'
  | 'correction'
  | 'other';

/**
 * One product line on a stock adjustment. `quantityDelta` is signed:
 * negative = stock removed (write-off/shrinkage/damage), positive = stock added
 * (gain/correction). `unitCost` is the weighted-average cost captured at post
 * time; `costEffect = quantityDelta × unitCost`.
 */
export interface StockAdjustmentLine {
  id: ID;
  adjustmentId: ID;
  productId: ID;
  warehouseId: ID;
  quantityDelta: number;
  unitCost: number;
  costEffect: number;
  notes?: string;
}

/**
 * A stock adjustment document — write-off / shrinkage / damage / stock gain /
 * correction (migration 0027). Draft-then-post lifecycle; a posted adjustment is
 * immutable (corrections are a new adjustment). Posting generates
 * `write_off` / `stock_gain` / `correction` movements and one balanced GL entry
 * (DR/CR 5050 Inventory Adjustments vs the inventory account).
 */
export interface StockAdjustment extends BaseEntity {
  adjustmentNumber: string;
  warehouseId: ID;
  adjustmentDate: ISODateString;
  reason: StockAdjustmentReason;
  notes?: string;
  lineItems: StockAdjustmentLine[];
  /** Net cost effect on the inventory carrying value, 2dp. */
  totalCostEffect: number;
  status: StockAdjustmentStatus;
  approvedBy?: ID;
  approvedAt?: ISODateString;
  postedBy?: ID;
  postedAt?: ISODateString;
  journalEntryId?: ID;
}

export type StockAdjustmentHeader = Omit<StockAdjustment, 'lineItems'>;
export type NewStockAdjustmentLine = Omit<StockAdjustmentLine, 'id' | 'adjustmentId'> & { id?: ID };
