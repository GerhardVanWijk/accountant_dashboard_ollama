import type { Warehouse } from '@/types';
import type { StockOnHandRow } from './buildStockOnHandRows';

export interface WarehouseAnalysisRow {
  warehouse: Warehouse;
  itemCount: number;
  units: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

/**
 * Per-warehouse rollup (spec §13) aggregated straight from
 * `StockOnHandRow[]` — `stock_balances` is the authoritative per-warehouse
 * position (per the row builder's own doc comment), so this never re-derives
 * quantity or value on its own. "Inbound/In transit" (spec's optional extra
 * metric) is NOT included: `StockBalance.quantityOnOrder` is documented as
 * "0 until open-PO quantities are wired" (`src/types/stockBalance.ts`), so a
 * column here would just show zero everywhere — omitted rather than shown
 * as a always-zero placeholder (see docs/INVENTORY_REPORTS.md).
 */
export function buildWarehouseAnalysisRows(stockOnHandRows: StockOnHandRow[], warehouses: Warehouse[]): WarehouseAnalysisRow[] {
  const byWarehouse = new Map<string, WarehouseAnalysisRow>();
  for (const w of warehouses) {
    byWarehouse.set(w.id, { warehouse: w, itemCount: 0, units: 0, inventoryValue: 0, lowStockCount: 0, outOfStockCount: 0 });
  }
  for (const row of stockOnHandRows) {
    const bucket = byWarehouse.get(row.warehouse.id);
    if (!bucket) continue;
    bucket.itemCount += 1;
    bucket.units += row.onHand;
    bucket.inventoryValue += row.inventoryValue;
    if (row.status === 'low') bucket.lowStockCount += 1;
    if (row.status === 'out') bucket.outOfStockCount += 1;
  }
  return [...byWarehouse.values()];
}
