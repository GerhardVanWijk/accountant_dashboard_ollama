import { describe, expect, it } from 'vitest';
import type { Product, StockBalance, StockTransfer, Warehouse } from '@/types';
import { warehouseAggregates } from './warehouseAggregates';
import { commitmentKey } from '../services/stockCommitmentService';

const wh = (id: string, code: string, isDefault = false): Warehouse =>
  ({ id, name: `WH ${code}`, code, isDefault, status: 'active', createdAt: '', updatedAt: '' } as Warehouse);

const product = (id: string, cost: number, reorder?: number): Product =>
  ({
    id, sku: id, name: id, type: 'good', unitPrice: cost * 2, costPrice: cost,
    trackInventory: true, quantityOnHand: 0, status: 'active', reorderLevel: reorder,
    createdAt: '', updatedAt: '',
  } as Product);

const bal = (productId: string, warehouseId: string, qty: number): StockBalance =>
  ({ id: `${productId}-${warehouseId}`, productId, warehouseId, quantityOnHand: qty, quantityCommitted: 0, quantityOnOrder: 0, createdAt: '', updatedAt: '' } as StockBalance);

const transfer = (from: string, to: string, qty: number, status: StockTransfer['status']): StockTransfer =>
  ({
    id: `t-${from}-${to}`, transferNumber: 'TRF', fromWarehouseId: from, toWarehouseId: to, transferDate: '2026-09-01',
    lineItems: [{ id: 'l', transferId: 't', productId: 'p1', quantity: qty, unitCost: 1, totalCost: qty }],
    totalCost: qty, status, createdAt: '', updatedAt: '',
  } as StockTransfer);

describe('warehouseAggregates', () => {
  it('rolls up on hand, value, in-transit in/out and alerts per warehouse', () => {
    const warehouses = [wh('a', 'DC', true), wh('b', 'CPT')];
    const products = [product('p1', 10, 5), product('p2', 4)];
    const balances = [bal('p1', 'a', 3), bal('p2', 'a', 100), bal('p1', 'b', -2)];
    const transfers = [transfer('a', 'b', 8, 'in_transit'), transfer('a', 'b', 5, 'completed')];
    const commitments = new Map([[commitmentKey('p1', 'a'), 1]]);

    const [aRow, bRow] = warehouseAggregates(warehouses, balances, products, transfers, commitments);

    expect(aRow.onHand).toBe(103);
    expect(aRow.committed).toBe(1);
    expect(aRow.available).toBe(102);
    expect(aRow.stockValue).toBe(3 * 10 + 100 * 4);
    expect(aRow.inTransitOut).toBe(8); // only the in_transit transfer counts
    expect(aRow.inTransitIn).toBe(0);
    expect(aRow.lowStockItems).toBe(1); // p1: 3 on hand, reorder 5

    expect(bRow.onHand).toBe(-2);
    expect(bRow.negativeStockItems).toBe(1);
    expect(bRow.inTransitIn).toBe(8);
  });
});
