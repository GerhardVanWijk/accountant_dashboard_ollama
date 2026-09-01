import { describe, expect, it } from 'vitest';
import type { Product } from '@/types';
import { buildMarginAnalysisRows } from './buildMarginAnalysisRows';

function product(overrides: Partial<Product> = {}): Product {
  return { id: 'prod_1', sku: 'PEN-1', name: 'Blue Pen', type: 'good', unitPrice: 10, costPrice: 4, trackInventory: true, quantityOnHand: 10, status: 'active', createdAt: '', updatedAt: '', ...overrides };
}

describe('buildMarginAnalysisRows', () => {
  it('computes unit margin and margin percent from selling price vs current WAC', () => {
    const [row] = buildMarginAnalysisRows([product()]);
    expect(row.unitMargin).toBe(6);
    expect(row.marginPercent).toBe(60);
  });

  it('reports null margin percent, never 0 or Infinity, when selling price is zero', () => {
    const [row] = buildMarginAnalysisRows([product({ unitPrice: 0 })]);
    expect(row.marginPercent).toBeNull();
    expect(row.unitMargin).toBe(-4);
  });

  it('excludes services — margin/WAC is a goods-inventory concept', () => {
    const rows = buildMarginAnalysisRows([product({ type: 'service' })]);
    expect(rows).toHaveLength(0);
  });
});
