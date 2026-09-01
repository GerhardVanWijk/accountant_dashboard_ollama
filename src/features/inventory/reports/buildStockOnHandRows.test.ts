import { describe, expect, it } from 'vitest';
import type { Product, ProductCategory, StockBalance, Supplier, Warehouse } from '@/types';
import { buildStockOnHandRows, suggestedOrderQuantity } from './buildStockOnHandRows';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'PEN-1',
    name: 'Blue Pen',
    type: 'good',
    unitPrice: 10,
    costPrice: 4,
    trackInventory: true,
    quantityOnHand: 100,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function balance(overrides: Partial<StockBalance> = {}): StockBalance {
  return {
    id: 'bal_1',
    productId: 'prod_1',
    warehouseId: 'wh_1',
    quantityOnHand: 100,
    quantityCommitted: 10,
    quantityOnOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function warehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return { id: 'wh_1', name: 'Main Warehouse', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '', ...overrides };
}

describe('buildStockOnHandRows', () => {
  it('produces one row per (product, warehouse) balance, valued at company-wide WAC', () => {
    const rows = buildStockOnHandRows([product()], [balance()], [], [], [warehouse()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ onHand: 100, available: 90, committed: 10, wac: 4, inventoryValue: 400, status: 'in_stock' });
  });

  it('excludes untracked products entirely', () => {
    const rows = buildStockOnHandRows([product({ trackInventory: false })], [balance()], [], [], [warehouse()]);
    expect(rows).toHaveLength(0);
  });

  it('excludes a balance row whose product or warehouse no longer resolves', () => {
    const rows = buildStockOnHandRows([product()], [balance({ warehouseId: 'wh_missing' })], [], [], [warehouse()]);
    expect(rows).toHaveLength(0);
  });

  it('marks out of stock at/below zero and low stock at/below reorder level', () => {
    const p = product({ reorderLevel: 20 });
    const out = buildStockOnHandRows([p], [balance({ quantityOnHand: 0 })], [], [], [warehouse()]);
    expect(out[0].status).toBe('out');
    const low = buildStockOnHandRows([p], [balance({ quantityOnHand: 15 })], [], [], [warehouse()]);
    expect(low[0].status).toBe('low');
    const healthy = buildStockOnHandRows([p], [balance({ quantityOnHand: 50 })], [], [], [warehouse()]);
    expect(healthy[0].status).toBe('in_stock');
  });

  it('resolves category and supplier names, falling back to the free-text category or an em-dash', () => {
    const category: ProductCategory = { id: 'cat_1', name: 'Stationery', isActive: true, createdAt: '', updatedAt: '' };
    const supplier: Supplier = { id: 'sup_1', supplierNumber: 'SUP-1', name: 'Acme Supplies', currency: 'ZAR', balance: 0, status: 'active', onHold: false, createdAt: '', updatedAt: '' };
    const p = product({ categoryId: 'cat_1', preferredSupplierId: 'sup_1' });
    const rows = buildStockOnHandRows([p], [balance()], [category], [supplier], [warehouse()]);
    expect(rows[0].categoryName).toBe('Stationery');
    expect(rows[0].supplierName).toBe('Acme Supplies');

    const noRelation = buildStockOnHandRows([product({ category: 'Legacy text' })], [balance()], [], [], [warehouse()]);
    expect(noRelation[0].categoryName).toBe('Legacy text');
    expect(noRelation[0].supplierName).toBe('—');
  });

  it("sums to the exact same total the authoritative subledger valuation reports for the same tracked products", () => {
    // Two warehouses splitting one product's company-wide 100 units — the
    // same identity `reconcileInventory()` uses (Σ qty × costPrice) must
    // hold whether it's summed company-wide or per-warehouse-then-summed.
    const rows = buildStockOnHandRows(
      [product()],
      [balance({ id: 'b1', warehouseId: 'wh_1', quantityOnHand: 60 }), balance({ id: 'b2', warehouseId: 'wh_2', quantityOnHand: 40 })],
      [],
      [],
      [warehouse(), warehouse({ id: 'wh_2', name: 'Overflow' })],
    );
    const total = rows.reduce((sum, r) => sum + r.inventoryValue, 0);
    expect(total).toBe(100 * 4);
  });
});

describe('suggestedOrderQuantity', () => {
  it('is undefined when neither reorderQuantity nor preferredStockLevel is set', () => {
    expect(suggestedOrderQuantity({ available: 5, reorderQuantity: undefined, product: product() })).toBeUndefined();
  });

  it('uses reorderQuantity alone when preferredStockLevel is not set', () => {
    expect(suggestedOrderQuantity({ available: 5, reorderQuantity: 50, product: product() })).toBe(50);
  });

  it('uses (preferredStockLevel - available) alone when reorderQuantity is not set', () => {
    const p = product({ preferredStockLevel: 80 });
    expect(suggestedOrderQuantity({ available: 20, reorderQuantity: undefined, product: p })).toBe(60);
  });

  it('takes the max of the two documented candidates when both are set', () => {
    const p = product({ preferredStockLevel: 80 });
    expect(suggestedOrderQuantity({ available: 20, reorderQuantity: 10, product: p })).toBe(60); // target-based wins
    expect(suggestedOrderQuantity({ available: 70, reorderQuantity: 50, product: p })).toBe(50); // reorderQuantity wins
  });
});
