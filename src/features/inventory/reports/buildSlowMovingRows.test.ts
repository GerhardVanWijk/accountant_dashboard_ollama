import { describe, expect, it } from 'vitest';
import type { Product, StockMovement, Warehouse } from '@/types';
import { buildSlowMovingRows } from './buildSlowMovingRows';
import type { StockOnHandRow } from './buildStockOnHandRows';

const warehouse: Warehouse = { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };
const asOf = new Date('2026-09-01T00:00:00.000Z');

function row(overrides: Partial<StockOnHandRow> = {}): StockOnHandRow {
  const product: Product = { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '' };
  return { product, warehouse, categoryName: '—', supplierName: '—', onHand: 10, available: 10, committed: 0, reorderLevel: undefined, reorderQuantity: undefined, wac: 4, inventoryValue: 40, status: 'in_stock', ...overrides };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return { id: 'mv_1', productId: 'prod_1', warehouseId: 'wh_1', type: 'sale', quantityDelta: -1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('buildSlowMovingRows', () => {
  it('excludes zero-quantity rows — dead stock needs carrying value to flag', () => {
    const rows = buildSlowMovingRows([row({ onHand: 0, status: 'out' })], [], asOf);
    expect(rows).toHaveLength(0);
  });

  it('buckets by days since the last ECONOMIC movement, excluding transfers', () => {
    const movements = [
      movement({ movementDate: '2026-08-25', type: 'sale' }), // 7 days ago -> 0-30
      movement({ id: 'mv_2', movementDate: '2026-08-31', type: 'transfer_out' }), // should NOT count
    ];
    const [result] = buildSlowMovingRows([row()], movements, asOf);
    expect(result.lastMovementAt).toBe('2026-08-25');
    expect(result.daysSinceLastMovement).toBe(7);
    expect(result.bucket).toBe('0-30');
  });

  it('buckets a product with no economic movement at all as 180+, never a false "recent"', () => {
    const [result] = buildSlowMovingRows([row()], [movement({ type: 'transfer_in' })], asOf);
    expect(result.lastMovementAt).toBeUndefined();
    expect(result.bucket).toBe('180+');
  });

  it('reports lastSaleAt separately from lastMovementAt', () => {
    const movements = [
      movement({ id: 'mv_1', type: 'goods_received', movementDate: '2026-08-30' }), // recent receipt, never sold
    ];
    const [result] = buildSlowMovingRows([row()], movements, asOf);
    expect(result.lastMovementAt).toBe('2026-08-30');
    expect(result.lastSaleAt).toBeUndefined();
  });

  it('places boundary days correctly across all five buckets', () => {
    const days = (n: number) => new Date(asOf.getTime() - n * 86400000).toISOString();
    const at = (n: number) => buildSlowMovingRows([row()], [movement({ movementDate: days(n) })], asOf)[0].bucket;
    expect(at(30)).toBe('0-30');
    expect(at(31)).toBe('31-60');
    expect(at(60)).toBe('31-60');
    expect(at(61)).toBe('61-90');
    expect(at(90)).toBe('61-90');
    expect(at(91)).toBe('91-180');
    expect(at(180)).toBe('91-180');
    expect(at(181)).toBe('180+');
  });
});
