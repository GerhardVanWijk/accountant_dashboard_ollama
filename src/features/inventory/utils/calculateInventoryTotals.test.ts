import { describe, expect, it } from 'vitest';
import type { Product } from '@/types';
import { calculateInventoryTotals } from './calculateInventoryTotals';

function product(overrides: Partial<Product>): Product {
  return {
    id: overrides.id ?? 'p1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sku: 'SKU-1',
    name: 'Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 60,
    trackInventory: true,
    quantityOnHand: 10,
    status: 'active',
    ...overrides,
  };
}

describe('calculateInventoryTotals', () => {
  it('sums cost/selling value and margin across tracked products only', () => {
    const products = [
      product({ id: 'p1', quantityOnHand: 10, costPrice: 60, unitPrice: 100 }),
      product({ id: 'p2', quantityOnHand: 5, costPrice: 40, unitPrice: 90 }),
    ];

    const totals = calculateInventoryTotals(products);

    expect(totals.stockValueAtCost).toBe(10 * 60 + 5 * 40); // 800
    expect(totals.stockValueAtSelling).toBe(10 * 100 + 5 * 90); // 1450
    expect(totals.potentialMargin).toBe(1450 - 800);
    expect(totals.lineCount).toBe(2);
  });

  it('excludes non-tracked (service) products from every figure', () => {
    const products = [
      product({ id: 'p1', trackInventory: true, quantityOnHand: 10, costPrice: 60, unitPrice: 100 }),
      product({ id: 'p2', trackInventory: false, type: 'service', quantityOnHand: 0, costPrice: 0, unitPrice: 500 }),
    ];

    const totals = calculateInventoryTotals(products);

    expect(totals.stockValueAtCost).toBe(600);
    expect(totals.stockValueAtSelling).toBe(1000);
    expect(totals.lineCount).toBe(1);
  });

  it('excludes tracked products with zero stock from lineCount but still values them at zero', () => {
    const products = [product({ id: 'p1', trackInventory: true, quantityOnHand: 0, costPrice: 60, unitPrice: 100 })];

    const totals = calculateInventoryTotals(products);

    expect(totals.stockValueAtCost).toBe(0);
    expect(totals.lineCount).toBe(0);
  });

  it('returns all-zero totals for an empty catalogue', () => {
    const totals = calculateInventoryTotals([]);
    expect(totals).toEqual({ stockValueAtCost: 0, stockValueAtSelling: 0, potentialMargin: 0, lineCount: 0 });
  });
});
