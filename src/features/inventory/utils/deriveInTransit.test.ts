import { describe, expect, it } from 'vitest';
import type { StockTransfer } from '@/types';
import { inTransitForProduct, transfersInProgress } from './deriveInTransit';

const transfer = (over: Partial<StockTransfer>): StockTransfer => ({
  id: 't1',
  transferNumber: 'TRF-0001',
  fromWarehouseId: 'wh-a',
  toWarehouseId: 'wh-b',
  transferDate: '2026-09-01',
  lineItems: [],
  totalCost: 0,
  status: 'in_transit',
  createdAt: '2026-09-01',
  updatedAt: '2026-09-01',
  ...over,
});

describe('inTransitForProduct', () => {
  it('sums only in_transit transfers that carry the product', () => {
    const transfers = [
      transfer({
        id: 't1',
        status: 'in_transit',
        lineItems: [{ id: 'l1', transferId: 't1', productId: 'p1', quantity: 5, unitCost: 10, totalCost: 50 }],
      }),
      transfer({
        id: 't2',
        status: 'completed',
        lineItems: [{ id: 'l2', transferId: 't2', productId: 'p1', quantity: 3, unitCost: 10, totalCost: 30 }],
      }),
      transfer({
        id: 't3',
        status: 'in_transit',
        lineItems: [{ id: 'l3', transferId: 't3', productId: 'other', quantity: 9, unitCost: 1, totalCost: 9 }],
      }),
    ];
    const result = inTransitForProduct(transfers, 'p1');
    expect(result.totalQuantity).toBe(5);
    expect(result.totalValue).toBe(50);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].transferNumber).toBe('TRF-0001');
  });

  it('is empty when nothing is in transit for the product', () => {
    expect(inTransitForProduct([], 'p1')).toEqual({ totalQuantity: 0, totalValue: 0, legs: [] });
  });
});

describe('transfersInProgress', () => {
  it('returns one row per in_transit transfer with its total quantity/value', () => {
    const rows = transfersInProgress([
      transfer({
        id: 't1',
        status: 'in_transit',
        lineItems: [
          { id: 'l1', transferId: 't1', productId: 'p1', quantity: 2, unitCost: 10, totalCost: 20 },
          { id: 'l2', transferId: 't1', productId: 'p2', quantity: 1, unitCost: 5, totalCost: 5 },
        ],
      }),
      transfer({ id: 't2', status: 'draft' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].value).toBe(25);
  });
});
