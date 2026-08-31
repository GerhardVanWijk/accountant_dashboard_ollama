import { describe, it, expect } from 'vitest';
import type { Product, ProductCategory, StockBalance, Supplier } from '@/types';
import { buildInventoryRows } from './buildInventoryRows';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    sku: 'SKU-1',
    name: 'Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 60,
    trackInventory: true,
    quantityOnHand: 20,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
const balance = (o: Partial<StockBalance>): StockBalance =>
  ({
    id: `${o.productId}-${o.warehouseId}`,
    productId: 'p1',
    warehouseId: 'w1',
    quantityOnHand: 0,
    quantityCommitted: 0,
    quantityOnOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...o,
  }) as StockBalance;
const category = (o: Partial<ProductCategory>): ProductCategory =>
  ({ id: 'c1', name: 'Furniture', isActive: true, createdAt: '', updatedAt: '', ...o }) as ProductCategory;
const supplier = (o: Partial<Supplier>): Supplier =>
  ({ id: 's1', name: 'Acme', supplierNumber: 'SUP-1', currency: 'ZAR', balance: 0, status: 'active', createdAt: '', updatedAt: '', ...o }) as Supplier;

describe('buildInventoryRows', () => {
  it('computes value, margin and available from balances', () => {
    const [row] = buildInventoryRows(
      [product({ categoryId: 'c1', preferredSupplierId: 's1' })],
      [balance({ quantityOnHand: 15, quantityCommitted: 5 }), balance({ id: 'x', warehouseId: 'w2', quantityOnHand: 5 })],
      [category({})],
      [supplier({})],
    );
    expect(row.onHand).toBe(20); // company-wide scalar
    expect(row.committed).toBe(5);
    expect(row.available).toBe(15); // (15-5+0) + (5-0+0)
    expect(row.inventoryValue).toBe(1200); // 20 × 60
    expect(row.marginPercent).toBeCloseTo(40); // (100-60)/100
    expect(row.categoryName).toBe('Furniture');
    expect(row.supplierName).toBe('Acme');
    expect(row.stockState).toBe('in_stock');
  });

  it('marks a product at/below its reorder level as low', () => {
    const [row] = buildInventoryRows([product({ quantityOnHand: 8, reorderLevel: 10 })], [], [], []);
    expect(row.stockState).toBe('low');
  });

  it('marks a zero-quantity tracked product as out', () => {
    const [row] = buildInventoryRows([product({ quantityOnHand: 0 })], [], [], []);
    expect(row.stockState).toBe('out');
  });

  it('a non-tracked product is untracked with no value', () => {
    const [row] = buildInventoryRows([product({ trackInventory: false, type: 'service' })], [], [], []);
    expect(row.stockState).toBe('untracked');
    expect(row.inventoryValue).toBe(0);
    expect(row.onHand).toBe(0);
  });

  it('falls back to the free-text category and an em-dash supplier', () => {
    const [row] = buildInventoryRows([product({ category: 'Legacy', categoryId: undefined })], [], [], []);
    expect(row.categoryName).toBe('Legacy');
    expect(row.supplierName).toBe('—');
  });

  it('margin is null when there is no selling price', () => {
    const [row] = buildInventoryRows([product({ unitPrice: 0 })], [], [], []);
    expect(row.marginPercent).toBeNull();
  });
});
