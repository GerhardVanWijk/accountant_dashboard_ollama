import type { Product, StockAdjustment, Warehouse } from '@/types';

export interface AdjustmentReportRow {
  adjustment: StockAdjustment;
  lineId: string;
  date: string;
  adjustmentNumber: string;
  warehouseName: string;
  productSku: string;
  productName: string;
  reason: StockAdjustment['reason'];
  /** `'gain'` when the line increased quantity, `'loss'` when it decreased it — mirrors the sign of `quantityDelta`, never independently inferred from `reason`. */
  direction: 'gain' | 'loss';
  quantity: number;
  unitCost: number;
  value: number;
  status: StockAdjustment['status'];
  journalEntryId: string | undefined;
}

/**
 * Line-level Stock Adjustment report (spec §8) — flattens every posted
 * document's `lineItems` (the real evidence: `unitCost`/`costEffect`
 * captured at post time, per `docs/INVENTORY_ARCHITECTURE.md`) into one row
 * per line. `direction` reads the line's own signed `quantityDelta`, never
 * the header `reason` — a `'correction'` reason can be either a gain or a
 * loss depending on the actual line.
 */
export function buildAdjustmentReportRows(
  adjustments: StockAdjustment[],
  products: Product[],
  warehouses: Warehouse[],
): AdjustmentReportRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const rows: AdjustmentReportRow[] = [];
  for (const adjustment of adjustments) {
    for (const line of adjustment.lineItems) {
      const product = productById.get(line.productId);
      rows.push({
        adjustment,
        lineId: line.id,
        date: adjustment.adjustmentDate,
        adjustmentNumber: adjustment.adjustmentNumber,
        warehouseName: warehouseById.get(line.warehouseId)?.name ?? warehouseById.get(adjustment.warehouseId)?.name ?? '—',
        productSku: product?.sku ?? line.productId,
        productName: product?.name ?? line.productId,
        reason: adjustment.reason,
        direction: line.quantityDelta >= 0 ? 'gain' : 'loss',
        quantity: line.quantityDelta,
        unitCost: line.unitCost,
        value: line.costEffect,
        status: adjustment.status,
        journalEntryId: adjustment.journalEntryId,
      });
    }
  }
  return rows;
}

export interface AdjustmentReportSummary {
  totalGains: number;
  totalLosses: number;
  netAdjustment: number;
  /** The `'write_off'`/`'shrinkage'`/`'damage'` reasons' negative value, specifically — spec §8's "Total write-offs" is a subset of total losses, not a synonym for it. */
  totalWriteOffs: number;
}

const WRITE_OFF_REASONS = new Set<StockAdjustment['reason']>(['write_off', 'shrinkage', 'damage']);

export function summarizeAdjustmentReport(rows: AdjustmentReportRow[]): AdjustmentReportSummary {
  let totalGains = 0;
  let totalLosses = 0;
  let totalWriteOffs = 0;
  for (const r of rows) {
    if (r.value >= 0) totalGains += r.value;
    else totalLosses += r.value;
    if (WRITE_OFF_REASONS.has(r.reason) && r.value < 0) totalWriteOffs += r.value;
  }
  return { totalGains, totalLosses, netAdjustment: totalGains + totalLosses, totalWriteOffs };
}
