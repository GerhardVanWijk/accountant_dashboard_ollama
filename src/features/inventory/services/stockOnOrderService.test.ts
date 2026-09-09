import { describe, expect, it } from 'vitest';
import type { PurchaseOrder, Warehouse } from '@/types';
import type { IPurchaseOrderRepository } from '@/repositories/IPurchaseOrderRepository';
import type { IWarehouseRepository } from '../repositories/IWarehouseRepository';
import { StockOnOrderService, isOpenPurchaseOrder, getOnOrderForProduct, totalOnOrder } from './stockOnOrderService';
import { commitmentKey } from './stockCommitmentService';

const wh = (id: string, isDefault = false): Warehouse =>
  ({ id, name: id, code: id, isDefault, status: 'active', createdAt: '', updatedAt: '' } as Warehouse);

const po = (over: Partial<PurchaseOrder>): PurchaseOrder =>
  ({
    id: 'po1',
    poNumber: 'PO-0001',
    supplierId: 's1',
    orderDate: '2026-09-01',
    lineItems: [],
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as PurchaseOrder;

function service(orders: PurchaseOrder[], warehouses: Warehouse[]) {
  const poRepo = { getAll: async () => orders } as unknown as IPurchaseOrderRepository;
  const whRepo = { getAll: async () => warehouses } as unknown as IWarehouseRepository;
  return new StockOnOrderService(poRepo, whRepo);
}

describe('isOpenPurchaseOrder', () => {
  it('is open only for a sent PO with no bill and no receipt journal', () => {
    expect(isOpenPurchaseOrder({ status: 'sent' })).toBe(true);
    expect(isOpenPurchaseOrder({ status: 'draft' })).toBe(false);
    expect(isOpenPurchaseOrder({ status: 'received' })).toBe(false);
    expect(isOpenPurchaseOrder({ status: 'cancelled' })).toBe(false);
    expect(isOpenPurchaseOrder({ status: 'sent', billId: 'b1' })).toBe(false);
    expect(isOpenPurchaseOrder({ status: 'sent', journalEntryId: 'je1' })).toBe(false);
  });
});

describe('StockOnOrderService.getOnOrderMap', () => {
  it('sums open PO lines per product/warehouse, falling back to the default warehouse', async () => {
    const map = await service(
      [
        po({
          id: 'po1',
          status: 'sent',
          lineItems: [
            { id: 'l1', productId: 'p1', warehouseId: 'wh-a', description: 'x', quantity: 10, unitPrice: 1, taxAmount: 0, lineTotal: 10 },
            { id: 'l2', productId: 'p1', description: 'x', quantity: 4, unitPrice: 1, taxAmount: 0, lineTotal: 4 },
          ],
        }),
        po({ id: 'po2', status: 'received', lineItems: [{ id: 'l3', productId: 'p1', description: 'x', quantity: 99, unitPrice: 1, taxAmount: 0, lineTotal: 99 }] }),
        po({ id: 'po3', status: 'draft', lineItems: [{ id: 'l4', productId: 'p1', description: 'x', quantity: 50, unitPrice: 1, taxAmount: 0, lineTotal: 50 }] }),
      ],
      [wh('wh-a'), wh('wh-def', true)],
    ).getOnOrderMap();

    expect(map.get(commitmentKey('p1', 'wh-a'))).toBe(10);
    expect(map.get(commitmentKey('p1', 'wh-def'))).toBe(4);
    expect(getOnOrderForProduct(map, 'p1')).toBe(14);
    expect(totalOnOrder(map)).toBe(14);
  });

  it('skips a warehouse-less line when there is no default warehouse', async () => {
    const map = await service(
      [po({ lineItems: [{ id: 'l1', productId: 'p1', description: 'x', quantity: 5, unitPrice: 1, taxAmount: 0, lineTotal: 5 }] })],
      [wh('wh-a')],
    ).getOnOrderMap();
    expect(map.size).toBe(0);
  });
});
