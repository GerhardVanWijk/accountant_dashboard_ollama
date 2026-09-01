import type { Product, StockTake, Warehouse } from '@/types';

export interface StockTakeVarianceRow {
  stockTake: StockTake;
  lineId: string;
  stockTakeNumber: string;
  warehouseName: string;
  countDate: string;
  productSku: string;
  productName: string;
  expectedQty: number;
  countedQty: number;
  varianceQty: number;
  /** Weighted-average cost frozen at count time — never today's WAC (a posted take is immutable). */
  frozenWac: number;
  varianceValue: number;
  reason: string | undefined;
  status: StockTake['status'];
}

/**
 * Line-level Stock Take Variance report (spec §10) — flattens every stock
 * take's `lineItems` that have actually been counted (`countedQty` set;
 * lines still awaiting a count carry no meaningful variance yet, so they're
 * excluded rather than shown as a fabricated zero). Every figure —
 * `expectedQty`, `countedQty`, `frozenWac`, `varianceValue` — is the exact
 * value frozen on the line at count/freeze time, never recomputed against
 * today's stock position (a posted stock take is immutable evidence).
 */
export function buildStockTakeVarianceRows(stockTakes: StockTake[], products: Product[], warehouses: Warehouse[]): StockTakeVarianceRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const rows: StockTakeVarianceRow[] = [];
  for (const stockTake of stockTakes) {
    for (const line of stockTake.lineItems) {
      if (line.countedQty === undefined) continue;
      const product = productById.get(line.productId);
      rows.push({
        stockTake,
        lineId: line.id,
        stockTakeNumber: stockTake.stockTakeNumber,
        warehouseName: warehouseById.get(line.warehouseId)?.name ?? warehouseById.get(stockTake.warehouseId)?.name ?? '—',
        countDate: stockTake.countDate,
        productSku: product?.sku ?? line.productId,
        productName: product?.name ?? line.productId,
        expectedQty: line.expectedQty,
        countedQty: line.countedQty,
        varianceQty: line.varianceQty,
        frozenWac: line.unitCost,
        varianceValue: line.varianceValue,
        reason: line.reason,
        status: stockTake.status,
      });
    }
  }
  return rows;
}

export interface StockTakeVarianceSummary {
  positiveVariance: number;
  negativeVariance: number;
  netVariance: number;
  absoluteVariance: number;
  mismatchedItemCount: number;
}

export function summarizeStockTakeVariance(rows: StockTakeVarianceRow[]): StockTakeVarianceSummary {
  let positiveVariance = 0;
  let negativeVariance = 0;
  let mismatchedItemCount = 0;
  for (const r of rows) {
    if (r.varianceValue > 0) positiveVariance += r.varianceValue;
    else if (r.varianceValue < 0) negativeVariance += r.varianceValue;
    if (r.varianceQty !== 0) mismatchedItemCount += 1;
  }
  return {
    positiveVariance,
    negativeVariance,
    netVariance: positiveVariance + negativeVariance,
    absoluteVariance: positiveVariance - negativeVariance,
    mismatchedItemCount,
  };
}
