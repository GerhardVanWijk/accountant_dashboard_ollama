import type { StockOnHandRow } from './buildStockOnHandRows';
import { suggestedOrderQuantity } from './buildStockOnHandRows';

export interface LowStockRow extends StockOnHandRow {
  suggestedOrderQty: number | undefined;
}

/**
 * Products at or below their reorder threshold (spec §5) — every row is a
 * `StockOnHandRow` already at `status === 'low'`, no independent
 * quantity/threshold check. `suggestedOrderQty` uses the ONE documented
 * formula (`max(reorderQuantity, preferredStockLevel − available)` —
 * `buildStockOnHandRows.suggestedOrderQuantity`); rows for a product with
 * neither field set carry `undefined`, shown as "—", never a guessed number.
 */
export function buildLowStockRows(stockOnHandRows: StockOnHandRow[]): LowStockRow[] {
  return stockOnHandRows
    .filter((r) => r.status === 'low')
    .map((r) => ({ ...r, suggestedOrderQty: suggestedOrderQuantity(r) }));
}
