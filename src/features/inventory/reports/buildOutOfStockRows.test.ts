import { describe, expect, it } from 'vitest';
import type { Product, StockMovement, Warehouse } from '@/types';
import { buildOutOfStockRows } from './buildOutOfStockRows';
import type { StockOnHandRow } from './buildStockOnHandRows';

function row(overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  const product: Product = {
    id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4,
    trackInventory: true, quantityOnHand: 0, status: 'active', createdAt: '', updatedAt: '',
  };
  const warehouse: Warehouse = { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };
  return {
    product, warehouse, categoryName: '—', supplierName: '—', onHand: 0, available: 0, committed: 0,
    reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 0, status: 'out', ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: 'mv_1', productId: 'prod_1', warehouseId: 'wh_1', type: 'sale', quantityDelta: -5,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...overrides,
  };
}

describe('buildOutOfStockRows', () => {
  it('includes only rows already classified out, in the same order', () => {
    const rows = [row({ status: 'in_stock' }), row({ status: 'low' }), row()];
    expect(buildOutOfStockRows(rows, [])).toHaveLength(1);
  });

  it('attaches the most recent movement date for that product/warehouse', () => {
    const movements = [
      movement({ id: 'mv_1', movementDate: '2026-08-01' }),
      movement({ id: 'mv_2', movementDate: '2026-08-15' }),
    ];
    const [result] = buildOutOfStockRows([row()], movements);
    expect(result.lastMovementAt).toBe('2026-08-15');
  });

  it('leaves lastMovementAt undefined when the ledger has no movement for this key', () => {
    const [result] = buildOutOfStockRows([row()], [movement({ productId: 'other_product' })]);
    expect(result.lastMovementAt).toBeUndefined();
  });

  it('carries the product active/inactive status through explicitly', () => {
    const [result] = buildOutOfStockRows([row({ product: { ...row().product, status: 'inactive' } })], []);
    expect(result.productStatus).toBe('inactive');
  });
});
