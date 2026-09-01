import { describe, expect, it } from 'vitest';
import type { Product, Warehouse } from '@/types';
import { buildLowStockRows } from './buildLowStockRows';
import type { StockOnHandRow } from './buildStockOnHandRows';

function row(overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  const product: Product = {
    id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4,
    trackInventory: true, quantityOnHand: 15, reorderLevel: 20, status: 'active', createdAt: '', updatedAt: '',
  };
  const warehouse: Warehouse = { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };
  return {
    product, warehouse, categoryName: '—', supplierName: '—', onHand: 15, available: 15, committed: 0,
    reorderLevel: 20, reorderQuantity: undefined, wac: 4, inventoryValue: 60, status: 'low', ...overrides,
  };
}

describe('buildLowStockRows', () => {
  it('includes only rows already classified low, in the same order', () => {
    const rows = [row({ status: 'in_stock' }), row(), row({ status: 'out' })];
    expect(buildLowStockRows(rows)).toHaveLength(1);
  });

  it('attaches a suggested order quantity using the documented formula', () => {
    const r = row({ reorderQuantity: 30 });
    const [result] = buildLowStockRows([r]);
    expect(result.suggestedOrderQty).toBe(30);
  });

  it('leaves suggestedOrderQty undefined when neither source field is set', () => {
    const [result] = buildLowStockRows([row()]);
    expect(result.suggestedOrderQty).toBeUndefined();
  });
});
