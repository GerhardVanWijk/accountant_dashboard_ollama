import { describe, expect, it } from 'vitest';
import type { Product, StockAdjustment, Warehouse } from '@/types';
import { buildAdjustmentReportRows, summarizeAdjustmentReport } from './buildAdjustmentReportRows';

const product: Product = { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 100, status: 'active', createdAt: '', updatedAt: '' };
const warehouse: Warehouse = { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };

function adjustment(overrides: Partial<StockAdjustment> = {}): StockAdjustment {
  return {
    id: 'adj_1', adjustmentNumber: 'ADJ-0001', warehouseId: 'wh_1', adjustmentDate: '2026-08-01',
    reason: 'write_off', lineItems: [{ id: 'line_1', adjustmentId: 'adj_1', productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: -5, unitCost: 4, costEffect: -20 }],
    totalCostEffect: -20, status: 'posted', journalEntryId: 'je_1', createdAt: '', updatedAt: '', ...overrides,
  };
}

describe('buildAdjustmentReportRows', () => {
  it('flattens one row per line, resolving product/warehouse names', () => {
    const rows = buildAdjustmentReportRows([adjustment()], [product], [warehouse]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productSku: 'PEN-1', warehouseName: 'Main', quantity: -5, value: -20, direction: 'loss' });
  });

  it('classifies direction from the line quantityDelta sign, not the header reason', () => {
    const gainLine = adjustment({
      reason: 'correction',
      lineItems: [{ id: 'l1', adjustmentId: 'adj_1', productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: 3, unitCost: 4, costEffect: 12 }],
    });
    const rows = buildAdjustmentReportRows([gainLine], [product], [warehouse]);
    expect(rows[0].direction).toBe('gain');
  });
});

describe('summarizeAdjustmentReport', () => {
  it('separates gains, losses, net, and write-offs specifically', () => {
    const gain = adjustment({
      id: 'adj_2', reason: 'stock_gain',
      lineItems: [{ id: 'l2', adjustmentId: 'adj_2', productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: 10, unitCost: 4, costEffect: 40 }],
    });
    const rows = buildAdjustmentReportRows([adjustment(), gain], [product], [warehouse]);
    const summary = summarizeAdjustmentReport(rows);
    expect(summary).toEqual({ totalGains: 40, totalLosses: -20, netAdjustment: 20, totalWriteOffs: -20 });
  });

  it('does not count a correction-reason loss as a write-off', () => {
    const correctionLoss = adjustment({
      reason: 'correction',
      lineItems: [{ id: 'l3', adjustmentId: 'adj_1', productId: 'prod_1', warehouseId: 'wh_1', quantityDelta: -2, unitCost: 4, costEffect: -8 }],
    });
    const summary = summarizeAdjustmentReport(buildAdjustmentReportRows([correctionLoss], [product], [warehouse]));
    expect(summary.totalWriteOffs).toBe(0);
    expect(summary.totalLosses).toBe(-8);
  });
});
