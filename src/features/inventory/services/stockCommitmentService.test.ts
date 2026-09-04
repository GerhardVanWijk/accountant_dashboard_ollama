import { describe, expect, it, vi } from 'vitest';
import type { DocumentLineItem, Invoice, SalesOrder, Warehouse } from '@/types';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { IWarehouseRepository } from '../repositories/IWarehouseRepository';
import {
  commitmentKey,
  getCommittedForProduct,
  StockCommitmentService,
} from './stockCommitmentService';

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: `inv_${Math.random().toString(36).slice(2, 8)}`,
    invoiceNumber: 'INV-1',
    customerId: 'cust_1',
    issueDate: '2026-09-05',
    dueDate: '2026-10-05',
    lineItems: [],
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function line(overrides: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return { id: `li_${Math.random().toString(36).slice(2, 8)}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0, ...overrides };
}

function order(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: `so_${Math.random().toString(36).slice(2, 8)}`,
    orderNumber: 'SO-1',
    customerId: 'cust_1',
    orderDate: '2026-09-01',
    lineItems: [],
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    currency: 'ZAR',
    status: 'confirmed',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const WAREHOUSES: Warehouse[] = [
  { id: 'wh_main', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' },
  { id: 'wh_of', name: 'Overflow', code: 'OF', isDefault: false, status: 'active', createdAt: '', updatedAt: '' },
];

function setup(orders: SalesOrder[], warehouses: Warehouse[] = WAREHOUSES, invoices: Invoice[] = []) {
  const salesOrderGetAll = vi.fn(async () => orders);
  const warehouseGetAll = vi.fn(async () => warehouses);
  const invoiceGetAll = vi.fn(async () => invoices);
  const salesOrderRepo = { getAll: salesOrderGetAll } as unknown as ISalesOrderRepository;
  const warehouseRepo = { getAll: warehouseGetAll } as unknown as IWarehouseRepository;
  const invoiceRepo = { getAll: invoiceGetAll } as unknown as IInvoiceRepository;
  const service = new StockCommitmentService(salesOrderRepo, warehouseRepo, invoiceRepo);
  return { service, salesOrderGetAll, warehouseGetAll, invoiceGetAll };
}

describe('StockCommitmentService.getCommitmentMap', () => {
  it('sums confirmed-SO line quantities per (product, warehouse)', async () => {
    const { service } = setup([
      order({ lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 4 }), line({ productId: 'p1', warehouseId: 'wh_main', quantity: 6 })] }),
      order({ lineItems: [line({ productId: 'p1', warehouseId: 'wh_of', quantity: 3 })] }),
      order({ lineItems: [line({ productId: 'p2', warehouseId: 'wh_main', quantity: 5 })] }),
    ]);

    const map = await service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(10);
    expect(map.get(commitmentKey('p1', 'wh_of'))).toBe(3);
    expect(map.get(commitmentKey('p2', 'wh_main'))).toBe(5);
    expect(getCommittedForProduct(map, 'p1')).toBe(13);
  });

  it('ignores pending / fulfilled / cancelled orders — only confirmed commits', async () => {
    const { service } = setup([
      order({ status: 'pending', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] }),
      order({ status: 'fulfilled', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] }),
      order({ status: 'cancelled', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] }),
      order({ status: 'confirmed', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 7 })] }),
    ]);

    const map = await service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(7);
  });

  it('releases the commitment once an order flips to fulfilled (as convertToInvoice does)', async () => {
    const so = order({ lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 8 })] });
    const { service } = setup([so]);
    expect((await service.getCommitmentMap()).get(commitmentKey('p1', 'wh_main'))).toBe(8);

    so.status = 'fulfilled';
    expect((await service.getCommitmentMap()).has(commitmentKey('p1', 'wh_main'))).toBe(false);
  });

  it('skips a line with no productId and a line with a non-positive quantity', async () => {
    const { service } = setup([
      order({ lineItems: [line({ warehouseId: 'wh_main', quantity: 5 }), line({ productId: 'p1', warehouseId: 'wh_main', quantity: 0 }), line({ productId: 'p1', warehouseId: 'wh_main', quantity: -2 })] }),
    ]);
    const map = await service.getCommitmentMap();
    expect(map.size).toBe(0);
  });

  it('falls back to the default warehouse when a line carries no warehouseId', async () => {
    const { service } = setup([order({ lineItems: [line({ productId: 'p1', quantity: 4 })] })]);
    const map = await service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(4);
  });

  it('skips a warehouse-less line when there is no default warehouse', async () => {
    const noDefault: Warehouse[] = WAREHOUSES.map((w) => ({ ...w, isDefault: false }));
    const { service } = setup([order({ lineItems: [line({ productId: 'p1', quantity: 4 })] })], noDefault);
    expect((await service.getCommitmentMap()).size).toBe(0);
  });

  it('creates NO stock movement — the service has no movement repository at all', async () => {
    // Structural guarantee: a commitment is derived, never a stock_movement.
    // The class takes exactly the sales-order + warehouse + invoice
    // repositories (all read-only), and getCommitmentMap only reads (getAll).
    expect(StockCommitmentService.length).toBe(3);
    const { service, salesOrderGetAll, warehouseGetAll, invoiceGetAll } = setup([
      order({ lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 3 })] }),
    ]);
    await service.getCommitmentMap();
    expect(salesOrderGetAll).toHaveBeenCalledTimes(1);
    expect(warehouseGetAll).toHaveBeenCalledTimes(1);
    expect(invoiceGetAll).toHaveBeenCalledTimes(1);
    // No `create` / `update` / movement surface is reachable from this service.
    expect((service as unknown as Record<string, unknown>).movementRepository).toBeUndefined();
  });
});

describe('StockCommitmentService.getCommitmentMap — Phase 5B.3 remaining commitment', () => {
  it('nets a POSTED invoice-line quantity off the confirmed SO line (ordered 10, invoiced 4 -> committed 6)', async () => {
    const so = order({
      lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })],
    });
    const inv = invoice({
      salesOrderId: so.id,
      status: 'sent',
      lineItems: [line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 4 })],
    });
    const map = await setup([so], WAREHOUSES, [inv]).service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(6);
  });

  it('a DRAFT invoice does NOT release commitment (ordered 10, draft 4 -> committed still 10)', async () => {
    const so = order({
      lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })],
    });
    const draft = invoice({
      salesOrderId: so.id,
      status: 'draft',
      lineItems: [line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 4 })],
    });
    const map = await setup([so], WAREHOUSES, [draft]).service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(10);
  });

  it('successive posted invoices drive the commitment to zero (10 -> 4 -> 3 -> 3)', async () => {
    const so = order({
      lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })],
    });
    const invLine = (q: number) => line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: q });
    const map = await setup([so], WAREHOUSES, [
      invoice({ salesOrderId: so.id, status: 'sent', lineItems: [invLine(4)] }),
      invoice({ salesOrderId: so.id, status: 'paid', lineItems: [invLine(3)] }),
      invoice({ salesOrderId: so.id, status: 'partially_paid', lineItems: [invLine(3)] }),
    ]).service.getCommitmentMap();
    expect(map.has(commitmentKey('p1', 'wh_main'))).toBe(false);
  });

  it('a VOID invoice line is ignored — commitment is not released by it', async () => {
    const so = order({
      lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })],
    });
    const voided = invoice({
      salesOrderId: so.id,
      status: 'void',
      lineItems: [line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 4 })],
    });
    const map = await setup([so], WAREHOUSES, [voided]).service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(10);
  });

  it('warehouse-specific: invoicing from wh_main does not release the wh_of commitment', async () => {
    const so = order({
      lineItems: [
        line({ id: 'sol-main', productId: 'p1', warehouseId: 'wh_main', quantity: 8 }),
        line({ id: 'sol-of', productId: 'p1', warehouseId: 'wh_of', quantity: 5 }),
      ],
    });
    const inv = invoice({
      salesOrderId: so.id,
      status: 'sent',
      lineItems: [line({ salesOrderLineId: 'sol-main', productId: 'p1', warehouseId: 'wh_main', quantity: 8 })],
    });
    const map = await setup([so], WAREHOUSES, [inv]).service.getCommitmentMap();
    expect(map.has(commitmentKey('p1', 'wh_main'))).toBe(false);
    expect(map.get(commitmentKey('p1', 'wh_of'))).toBe(5);
  });

  it('an unlinked invoice line (no salesOrderLineId) nets nothing — falls back to full ordered commitment', async () => {
    const so = order({
      lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })],
    });
    const legacyInv = invoice({
      salesOrderId: so.id,
      status: 'sent',
      lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 10 })],
    });
    const map = await setup([so], WAREHOUSES, [legacyInv]).service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(10);
  });

  it('over-invoiced line floors the commitment at 0, never negative', async () => {
    const so = order({
      lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 5 })],
    });
    const inv = invoice({
      salesOrderId: so.id,
      status: 'sent',
      lineItems: [line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 9 })],
    });
    const map = await setup([so], WAREHOUSES, [inv]).service.getCommitmentMap();
    expect(map.has(commitmentKey('p1', 'wh_main'))).toBe(false);
  });
});
