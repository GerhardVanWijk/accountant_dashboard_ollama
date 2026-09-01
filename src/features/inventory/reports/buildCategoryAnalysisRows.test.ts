import { describe, expect, it } from 'vitest';
import type { Product, ProductCategory, Warehouse } from '@/types';
import { buildCategoryAnalysisRows } from './buildCategoryAnalysisRows';
import type { StockOnHandRow } from './buildStockOnHandRows';

const warehouse: Warehouse = { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };
const categories: ProductCategory[] = [{ id: 'cat_1', name: 'Stationery', isActive: true, createdAt: '', updatedAt: '' }];

function row(overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  const product: Product = { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' };
  return { product, warehouse, categoryName: 'Stationery', supplierName: '—', onHand: 10, available: 10, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 40, status: 'in_stock', ...overrides };
}

describe('buildCategoryAnalysisRows', () => {
  it('aggregates by category name and computes share of total inventory value', () => {
    const other = row({ categoryName: 'Other', inventoryValue: 60, onHand: 15 });
    const rows = buildCategoryAnalysisRows([row(), other], categories);
    const stationery = rows.find((r) => r.categoryName === 'Stationery')!;
    expect(stationery).toMatchObject({ itemCount: 1, units: 10, inventoryValue: 40 });
    expect(stationery.percentOfInventoryValue).toBeCloseTo(40, 5);
  });

  it('groups uncategorised products under one bucket rather than one row per product', () => {
    const rows = buildCategoryAnalysisRows([row({ categoryName: '—' }), row({ categoryName: '—', inventoryValue: 40 })], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryName).toBe('Uncategorised');
    expect(rows[0].itemCount).toBe(2);
  });

  it('never includes a sales/COGS/margin field — stock/value only (spec §12 limitation)', () => {
    const [result] = buildCategoryAnalysisRows([row()], categories);
    expect(result).not.toHaveProperty('sales');
    expect(result).not.toHaveProperty('cogs');
    expect(result).not.toHaveProperty('grossMargin');
  });
});
