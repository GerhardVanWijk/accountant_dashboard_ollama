import { describe, expect, it, vi } from 'vitest';
import type { DeliveryNote, DeliveryNoteLineItem, DocumentLineItem, Invoice, SalesOrder, Warehouse } from '@/types';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { IDeliveryNoteRepository } from '@/repositories/IDeliveryNoteRepository';
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

function dnLine(overrides: Partial<DeliveryNoteLineItem> = {}): DeliveryNoteLineItem {
  return {
    id: `dnl_${Math.random().toString(36).slice(2, 8)}`,
    salesOrderLineId: 'sol-1',
    productId: 'p1',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxAmount: 0,
    lineTotal: 0,
    ...overrides,
  };
}

function deliveryNote(overrides: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: `dn_${Math.random().toString(36).slice(2, 8)}`,
    deliveryNoteNumber: 'DN-1',
    salesOrderId: 'so_1',
    customerId: 'cust_1',
    warehouseId: 'wh_main',
    deliveryDate: '2026-09-05',
    status: 'posted',
    lineItems: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function setup(
  orders: SalesOrder[],
  warehouses: Warehouse[] = WAREHOUSES,
  invoices: Invoice[] = [],
  deliveryNotes: DeliveryNote[] = [],
) {
  const salesOrderGetAll = vi.fn(async () => orders);
  const warehouseGetAll = vi.fn(async () => warehouses);
  const invoiceGetAll = vi.fn(async () => invoices);
  const deliveryNoteGetAll = vi.fn(async () => deliveryNotes);
  const salesOrderRepo = { getAll: salesOrderGetAll } as unknown as ISalesOrderRepository;
  const warehouseRepo = { getAll: warehouseGetAll } as unknown as IWarehouseRepository;
  const invoiceRepo = { getAll: invoiceGetAll } as unknown as IInvoiceRepository;
  const deliveryNoteRepo = { getAll: deliveryNoteGetAll } as unknown as IDeliveryNoteRepository;
  const service = new StockCommitmentService(salesOrderRepo, warehouseRepo, invoiceRepo, deliveryNoteRepo);
  return { service, salesOrderGetAll, warehouseGetAll, invoiceGetAll, deliveryNoteGetAll };
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

describe('StockCommitmentService.getCommitmentMap — Phase 5C delivery-aware commitment', () => {
  it('a POSTED Delivery Note reduces commitment exactly like a posted invoice (ordered 10, delivered 6 -> committed 4)', async () => {
    const so = order({ lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] });
    const dn = deliveryNote({ salesOrderId: so.id, warehouseId: 'wh_main', lineItems: [dnLine({ salesOrderLineId: 'sol-1', productId: 'p1', quantity: 6 })] });
    const map = await setup([so], WAREHOUSES, [], [dn]).service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(4);
  });

  it('a DRAFT Delivery Note does NOT reduce commitment', async () => {
    const so = order({ lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] });
    const dn = deliveryNote({ salesOrderId: so.id, warehouseId: 'wh_main', status: 'draft', lineItems: [dnLine({ salesOrderLineId: 'sol-1', productId: 'p1', quantity: 6 })] });
    const map = await setup([so], WAREHOUSES, [], [dn]).service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(10);
  });

  it('a delivery-linked posted invoice does NOT reduce commitment a second time (double-subtraction guard)', async () => {
    const so = order({ lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] });
    const dn = deliveryNote({ salesOrderId: so.id, warehouseId: 'wh_main', lineItems: [dnLine({ id: 'dnl-1', salesOrderLineId: 'sol-1', productId: 'p1', quantity: 7 })] });
    const invoiceFromDn = invoice({
      salesOrderId: so.id,
      status: 'sent',
      lineItems: [line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 4, deliveryNoteLineId: 'dnl-1' })],
    });
    const map = await setup([so], WAREHOUSES, [invoiceFromDn], [dn]).service.getCommitmentMap();
    // 7 delivered releases the commitment; the 4-unit invoice-from-DN must NOT release it AGAIN (would wrongly go to -1, floored/miscounted)
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(3);
  });

  it('delivered + direct together net correctly (ordered 10, delivered 4, direct 3 -> committed 3)', async () => {
    const so = order({ lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] });
    const dn = deliveryNote({ salesOrderId: so.id, warehouseId: 'wh_main', lineItems: [dnLine({ salesOrderLineId: 'sol-1', productId: 'p1', quantity: 4 })] });
    const directInv = invoice({
      salesOrderId: so.id,
      status: 'sent',
      lineItems: [line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 3 })],
    });
    const map = await setup([so], WAREHOUSES, [directInv], [dn]).service.getCommitmentMap();
    expect(map.get(commitmentKey('p1', 'wh_main'))).toBe(3);
  });

  it('with NO Delivery Notes at all, the formula reduces exactly to the Phase 5B.3 rule (regression proof)', async () => {
    const so = order({ lineItems: [line({ id: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 10 })] });
    const inv = invoice({
      salesOrderId: so.id,
      status: 'sent',
      lineItems: [line({ salesOrderLineId: 'sol-1', productId: 'p1', warehouseId: 'wh_main', quantity: 4 })],
    });
    const withDeliveryNoteRepo = await setup([so], WAREHOUSES, [inv], []).service.getCommitmentMap();
    expect(withDeliveryNoteRepo.get(commitmentKey('p1', 'wh_main'))).toBe(6); // identical to the Phase 5B.3 test above
  });
});
