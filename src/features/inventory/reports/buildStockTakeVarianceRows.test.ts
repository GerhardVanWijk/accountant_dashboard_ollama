import { describe, expect, it } from 'vitest';
import type { Product, StockTake, Warehouse } from '@/types';
import { buildStockTakeVarianceRows, summarizeStockTakeVariance } from './buildStockTakeVarianceRows';

const product: Product = { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 100, status: 'active', createdAt: '', updatedAt: '' };
const warehouse: Warehouse = { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };

function stockTake(overrides: Partial<StockTake> = {}): StockTake {
  return {
    id: 'stk_1', stockTakeNumber: 'STK-0001', warehouseId: 'wh_1', scope: 'all', scopeRef: {}, countDate: '2026-08-01',
    lineItems: [
      { id: 'l1', stockTakeId: 'stk_1', productId: 'prod_1', warehouseId: 'wh_1', expectedQty: 100, countedQty: 95, unitCost: 4, varianceQty: -5, varianceValue: -20, reason: 'Shrinkage' },
      { id: 'l2', stockTakeId: 'stk_1', productId: 'prod_1', warehouseId: 'wh_1', expectedQty: 50, countedQty: undefined, unitCost: 4, varianceQty: 0, varianceValue: 0 },
    ],
    totalVarianceValue: -20, status: 'posted', createdAt: '', updatedAt: '', ...overrides,
  };
}

describe('buildStockTakeVarianceRows', () => {
  it('flattens only lines that have actually been counted', () => {
    const rows = buildStockTakeVarianceRows([stockTake()], [product], [warehouse]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productSku: 'PEN-1', warehouseName: 'Main', expectedQty: 100, countedQty: 95, varianceQty: -5, frozenWac: 4, varianceValue: -20, reason: 'Shrinkage' });
  });

  it('uses the frozen unit cost, not any current WAC', () => {
    const [row] = buildStockTakeVarianceRows([stockTake()], [{ ...product, costPrice: 999 }], [warehouse]);
    expect(row.frozenWac).toBe(4);
  });
});

describe('summarizeStockTakeVariance', () => {
  it('separates positive/negative variance and counts mismatched items', () => {
    const gainLine = stockTake({
      id: 'stk_2',
      lineItems: [{ id: 'l3', stockTakeId: 'stk_2', productId: 'prod_1', warehouseId: 'wh_1', expectedQty: 10, countedQty: 12, unitCost: 4, varianceQty: 2, varianceValue: 8 }],
    });
    const rows = buildStockTakeVarianceRows([stockTake(), gainLine], [product], [warehouse]);
    const summary = summarizeStockTakeVariance(rows);
    expect(summary).toEqual({ positiveVariance: 8, negativeVariance: -20, netVariance: -12, absoluteVariance: 28, mismatchedItemCount: 2 });
  });

  it('does not count an exact-match line as mismatched', () => {
    const exact = stockTake({
      lineItems: [{ id: 'l4', stockTakeId: 'stk_1', productId: 'prod_1', warehouseId: 'wh_1', expectedQty: 10, countedQty: 10, unitCost: 4, varianceQty: 0, varianceValue: 0 }],
    });
    const summary = summarizeStockTakeVariance(buildStockTakeVarianceRows([exact], [product], [warehouse]));
    expect(summary.mismatchedItemCount).toBe(0);
  });
});
