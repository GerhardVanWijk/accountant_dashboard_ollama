import type { BaseEntity, ID } from './common';

/**
 * The kind of event that moved stock. Mirrors docs/INVENTORY_DOMAIN.md
 * § Perpetual Inventory Tracking triggers (GRN, Sales Invoice, Adjustment)
 * plus the transfer/opening-stock cases needed for multi-warehouse support.
 */
export type StockMovementType =
  | 'goods_received'
  | 'sale'
  | 'sales_return'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'opening';

/**
 * A single immutable entry in the perpetual-inventory ledger. This is the
 * ONLY record of why a product's on-hand quantity at a warehouse changed —
 * per docs/DO_NOT_BREAK.md § Inventory & Stock, quantities are never
 * written directly; they are always derived by summing these entries
 * (see stockService.recordStockMovement / getQuantityOnHand).
 *
 * APPEND-ONLY: once created, a StockMovement is never mutated or deleted.
 * A correction is made by recording an offsetting movement (e.g. a second
 * 'adjustment' entry), never by editing history.
 */
export interface StockMovement extends BaseEntity {
  productId: ID;
  warehouseId: ID;
  type: StockMovementType;
  /** Signed change to quantity on hand. Positive = stock in, negative = stock out. */
  quantityDelta: number;
  /** Free-text reference to the source document (GRN number, invoice number, transfer batch id, etc.). */
  reference?: string;
  /** Required context for adjustments/opening stock (reason for write-off, damage, shrinkage, count variance, etc.). */
  notes?: string;
}
