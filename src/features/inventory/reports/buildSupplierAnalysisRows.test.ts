import { describe, expect, it } from 'vitest';
import type { Product, Supplier, Warehouse } from '@/types';
import { buildSupplierAnalysisRows } from './buildSupplierAnalysisRows';
import type { StockOnHandRow } from './buildStockOnHandRows';

const warehouse: Warehouse = { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };
const supplier: Supplier = { id: 'sup_1', supplierNumber: 'SUP-1', name: 'Acme Supplies', currency: 'ZAR', balance: 0, status: 'active', onHold: false, createdAt: '', updatedAt: '' };

function row(overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  const product: Product = {
    id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true,
    quantityOnHand: 10, status: 'active', preferredSupplierId: 'sup_1', reorderQuantity: 30, createdAt: '', updatedAt: '',
  };
  return { product, warehouse, categoryName: '—', supplierName: 'Acme Supplies', onHand: 10, available: 10, committed: 0, reorderLevel: 20, reorderQuantity: 30, wac: 4, inventoryValue: 40, status: 'low', ...overrides };
}

describe('buildSupplierAnalysisRows', () => {
  it('aggregates only products carrying this supplier as preferred, and skips suppliers with none', () => {
    const noPreference = row({ product: { ...row().product, preferredSupplierId: undefined }, status: 'in_stock' });
    const rows = buildSupplierAnalysisRows([row(), noPreference], [supplier]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemCount: 1, inventoryValue: 40, lowStockCount: 1 });
  });

  it('sums suggested reorder quantity only across low-stock items, using 0 for items with no reorder data', () => {
    const [result] = buildSupplierAnalysisRows([row()], [supplier]);
    expect(result.outstandingReplenishmentQty).toBe(30);
  });

  it('never exposes a purchase-activity or profitability field (spec §14 limitation)', () => {
    const [result] = buildSupplierAnalysisRows([row()], [supplier]);
    expect(result).not.toHaveProperty('recentPurchaseActivity');
    expect(result).not.toHaveProperty('profitability');
  });
});
