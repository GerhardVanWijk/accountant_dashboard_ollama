import { describe, expect, it } from 'vitest';
import type { StockTransfer, Warehouse } from '@/types';
import { buildTransferReportRows } from './buildTransferReportRows';

const warehouses: Warehouse[] = [
  { id: 'wh_1', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
  { id: 'wh_2', name: 'Overflow', code: 'OVF', isDefault: false, status: 'active', createdAt: '', updatedAt: '' },
];

function transfer(overrides: Partial<StockTransfer> = {}): StockTransfer {
  return {
    id: 'tr_1', transferNumber: 'TRF-0001', fromWarehouseId: 'wh_1', toWarehouseId: 'wh_2', transferDate: '2026-08-01',
    lineItems: [{ id: 'l1', transferId: 'tr_1', productId: 'prod_1', quantity: 10, unitCost: 4, totalCost: 40 }],
    totalCost: 40, status: 'completed', createdAt: '', updatedAt: '', ...overrides,
  };
}

describe('buildTransferReportRows', () => {
  it('resolves warehouse names and sums line quantity/value', () => {
    const [row] = buildTransferReportRows([transfer()], warehouses);
    expect(row).toMatchObject({ fromWarehouseName: 'Main', toWarehouseName: 'Overflow', itemCount: 1, quantity: 10, value: 40 });
  });

  it('computes in-transit days from dispatch to receipt when both dates exist', () => {
    const [row] = buildTransferReportRows([transfer({ transferDate: '2026-08-01', receivedDate: '2026-08-04' })], warehouses);
    expect(row.inTransitDays).toBe(3);
  });

  it('leaves in-transit days undefined while still in transit (no receivedDate)', () => {
    const [row] = buildTransferReportRows([transfer({ status: 'in_transit', receivedDate: undefined })], warehouses);
    expect(row.inTransitDays).toBeUndefined();
  });
});
