import type { BaseEntity, ID, ISODateString } from './common';

/**
 * One FIFO costing lot — created whenever stock comes IN for a product
 * whose `Product.valuationMethod` is `'fifo'` (a goods receipt, or a
 * customer return re-entering stock). `StockMovement`
 * (src/types/stockMovement.ts) remains the sole, complete, immutable
 * audit trail of every quantity change for EVERY product regardless of
 * valuation method — `StockLot` is a secondary, narrower structure that
 * exists only to answer "which specific receipt did this FIFO-valued
 * product's cost come from," not the authoritative on-hand-quantity
 * source.
 *
 * DELIBERATE, NARROW EXCEPTION to this module's append-only-ledger
 * philosophy: `quantityRemaining` is the one mutable field here, decremented
 * as `StockLotService.consumeFifoLots()` draws from this lot oldest-first.
 * It is only ever decremented, never increased or reset — a lot is never
 * un-consumed, only a NEW lot is created (e.g. for a return). Everything
 * else on this record is set once at creation and never changes.
 */
export interface StockLot extends BaseEntity {
  productId: ID;
  warehouseId: ID;
  unitCost: number;
  /** Set once at creation — the original quantity this lot represents. Never changes. */
  quantityReceived: number;
  /** The one mutable field — see class doc. Starts equal to `quantityReceived`, only ever decreases. */
  quantityRemaining: number;
  /** When this lot entered stock — determines FIFO consumption order (oldest first). */
  receivedAt: ISODateString;
  /** The StockMovement (goods_received / sales_return / opening) this lot was created from, for traceability. */
  sourceMovementId: ID;
}
