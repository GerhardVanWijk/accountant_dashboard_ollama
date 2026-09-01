import { describe, expect, it } from 'vitest';
import type { Product, Warehouse } from '@/types';
import { buildWarehouseAnalysisRows } from './buildWarehouseAnalysisRows';
import type { StockOnHandRow } from './buildStockOnHandRows';

const warehouses: Warehouse[] = [
  { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
  { id: 'wh_2', name: 'Overflow', code: 'OVF', isDefault: false, status: 'active', createdAt: '', updatedAt: '' },
];

function row(warehouse: Warehouse, overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  const product: Product = { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' };
  return { product, warehouse, categoryName: '—', supplierName: '—', onHand: 10, available: 10, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 40, status: 'in_stock', ...overrides };
}

describe('buildWarehouseAnalysisRows', () => {
  it('includes every warehouse even with zero items, and aggregates the ones with rows', () => {
    const rows = buildWarehouseAnalysisRows([row(warehouses[0])], warehouses);
    expect(rows).toHaveLength(2);
    const main = rows.find((r) => r.warehouse.id === 'wh_1')!;
    expect(main).toMatchObject({ itemCount: 1, units: 10, inventoryValue: 40, lowStockCount: 0, outOfStockCount: 0 });
    const overflow = rows.find((r) => r.warehouse.id === 'wh_2')!;
    expect(overflow).toMatchObject({ itemCount: 0, units: 0, inventoryValue: 0 });
  });

  it('counts low and out-of-stock items per warehouse', () => {
    const rows = buildWarehouseAnalysisRows(
      [row(warehouses[0], { status: 'low' }), row(warehouses[0], { status: 'out', onHand: 0, inventoryValue: 0 })],
      warehouses,
    );
    const main = rows.find((r) => r.warehouse.id === 'wh_1')!;
    expect(main.lowStockCount).toBe(1);
    expect(main.outOfStockCount).toBe(1);
  });
});
