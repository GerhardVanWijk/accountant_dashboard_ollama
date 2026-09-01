import type { StockMovement } from '@/types';
import type { StockOnHandRow } from './buildStockOnHandRows';
import { lastMovementByKey, stockKey } from './lastMovementByKey';

export interface OutOfStockRow extends StockOnHandRow {
  /** ISO date/datetime of the most recent movement at this (product, warehouse), or `undefined` if none exists yet (e.g. an opening balance of zero that was never moved). */
  lastMovementAt: string | undefined;
  /** The product's own active/inactive state — spec §6: an inactive product must not read as an ordinary replenishment alert. */
  productStatus: 'active' | 'inactive';
}

/**
 * Products at `quantity <= 0` (spec §6), separate from the Low Stock report
 * (a distinct on-hand=0 alert, not just "below reorder level" — a product
 * with no reorder level set is still worth surfacing here). Carries the
 * product's own `active`/`inactive` status explicitly, and the last
 * movement date where the ledger has one, so a genuinely dead SKU
 * (inactive, never moved) doesn't read like a normal "reorder now" case.
 */
export function buildOutOfStockRows(stockOnHandRows: StockOnHandRow[], movements: StockMovement[]): OutOfStockRow[] {
  const lastMovement = lastMovementByKey(movements);
  return stockOnHandRows
    .filter((r) => r.status === 'out')
    .map((r) => {
      const movement = lastMovement.get(stockKey(r.product.id, r.warehouse.id));
      return {
        ...r,
        lastMovementAt: movement ? (movement.movementDate ?? movement.createdAt) : undefined,
        productStatus: r.product.status,
      };
    });
}
