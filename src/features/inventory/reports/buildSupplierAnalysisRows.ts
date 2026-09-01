import type { Supplier } from '@/types';
import type { StockOnHandRow } from './buildStockOnHandRows';
import { suggestedOrderQuantity } from './buildStockOnHandRows';

export interface SupplierAnalysisRow {
  supplier: Supplier;
  itemCount: number;
  inventoryValue: number;
  lowStockCount: number;
  /** Σ suggestedOrderQuantity across this supplier's low-stock items — undefined contributions (no reorder data) are simply skipped, never treated as 0. */
  outstandingReplenishmentQty: number;
}

/**
 * Supplier INVENTORY POSITION only (spec §14) — deliberately titled and
 * shaped to never imply "supplier profitability" or "purchase activity",
 * which spec §14 explicitly forbids unless the data genuinely supports it.
 * It does not: neither `Bill` nor `StockMovement` records which SUPPLIER a
 * specific receipt came from (`StockMovement` has no `supplierId` field at
 * all — verified during the Phase 8 audit) — the only real link this schema
 * has is `Product.preferredSupplierId`, a static "who we'd normally buy
 * this from" assignment, not a record of any actual purchase. So: which
 * items prefer this supplier, how much of the company's inventory value
 * they represent, and how many are currently low/need reordering — nothing
 * about recent activity, cost, or margin.
 */
export function buildSupplierAnalysisRows(stockOnHandRows: StockOnHandRow[], suppliers: Supplier[]): SupplierAnalysisRow[] {
  const bySupplier = new Map<string, SupplierAnalysisRow>();
  for (const s of suppliers) {
    bySupplier.set(s.id, { supplier: s, itemCount: 0, inventoryValue: 0, lowStockCount: 0, outstandingReplenishmentQty: 0 });
  }
  for (const row of stockOnHandRows) {
    const supplierId = row.product.preferredSupplierId;
    if (!supplierId) continue;
    const bucket = bySupplier.get(supplierId);
    if (!bucket) continue;
    bucket.itemCount += 1;
    bucket.inventoryValue += row.inventoryValue;
    if (row.status === 'low') {
      bucket.lowStockCount += 1;
      bucket.outstandingReplenishmentQty += suggestedOrderQuantity(row) ?? 0;
    }
  }
  return [...bySupplier.values()].filter((r) => r.itemCount > 0).sort((a, b) => b.inventoryValue - a.inventoryValue);
}
