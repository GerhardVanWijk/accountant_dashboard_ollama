import { describe, expect, it } from 'vitest';
import type { DocumentLineItem, Invoice, SalesOrder } from '@/types';
import {
  commitmentKey,
  externalCommittedFor,
  getCommittedForProduct,
  ownCommitmentMap,
  StockCommitmentService,
} from './stockCommitmentService';
import type { ISalesOrderRepository } from '@/repositories/ISalesOrderRepository';
import type { IInvoiceRepository } from '@/repositories/IInvoiceRepository';
import type { IWarehouseRepository } from '../repositories/IWarehouseRepository';
import type { Warehouse } from '@/types';

/**
 * Document-context self-commitment exclusion (Phase 5A correction).
 *
 * `getCommitmentMap()` is a GLOBAL rollup — when a `confirmed` Sales Order is
 * opened for editing, its own quantities are already in that map, so its line
 * editor would otherwise report the order's own reserved units as "committed
 * to other orders". `ownCommitmentMap` + `externalCommittedFor` subtract the
 * order's own contribution at the document-context layer only; the global map
 * itself is never mutated.
 */

function line(overrides: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return {
    id: `li_${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxAmount: 0,
    lineTotal: 0,
    ...overrides,
  };
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
  { id: 'wh_cpt', name: 'Cape Town', code: 'CPT', isDefault: false, status: 'active', createdAt: '', updatedAt: '' },
  { id: 'wh_jhb', name: 'Johannesburg', code: 'JHB', isDefault: false, status: 'active', createdAt: '', updatedAt: '' },
];
const DEFAULT_WH = 'wh_main';

function globalMap(orders: SalesOrder[], warehouses: Warehouse[] = WAREHOUSES, invoices: Invoice[] = []) {
  const salesOrderRepo = { getAll: async () => orders } as unknown as ISalesOrderRepository;
  const warehouseRepo = { getAll: async () => warehouses } as unknown as IWarehouseRepository;
  const invoiceRepo = { getAll: async () => invoices } as unknown as IInvoiceRepository;
  return new StockCommitmentService(salesOrderRepo, warehouseRepo, invoiceRepo).getCommitmentMap();
}

/** Editor availability for one product/warehouse, as `SalesOrderForm` composes it. */
function editorAvailable(
  onHand: number,
  global: Map<string, number>,
  own: Map<string, number>,
  productId: string,
  warehouseId?: string,
) {
  return onHand - externalCommittedFor(global, own, productId, warehouseId);
}

describe('ownCommitmentMap', () => {
  it('is empty for a create-mode form (no persisted order)', () => {
    expect(ownCommitmentMap(undefined, DEFAULT_WH).size).toBe(0);
  });

  it.each(['pending', 'fulfilled', 'cancelled'] as const)(
    'is empty when the persisted order status is %s (it contributes nothing to the global map)',
    (status) => {
      const so = order({ status, lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 4 })] });
      expect(ownCommitmentMap(so, DEFAULT_WH).size).toBe(0);
    },
  );

  it('sums a confirmed order per (product, warehouse), applying the default-warehouse fallback', () => {
    const so = order({
      lineItems: [
        line({ productId: 'p1', quantity: 4 }), // no warehouse -> default
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 2 }),
      ],
    });
    const own = ownCommitmentMap(so, DEFAULT_WH);
    expect(own.get(commitmentKey('p1', 'wh_main'))).toBe(4);
    expect(own.get(commitmentKey('p1', 'wh_cpt'))).toBe(2);
  });

  it('sums MULTIPLE lines of the same product in the same warehouse (not just one line)', () => {
    const so = order({
      lineItems: [
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 2 }),
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 3 }),
      ],
    });
    expect(ownCommitmentMap(so, DEFAULT_WH).get(commitmentKey('p1', 'wh_cpt'))).toBe(5);
  });

  it('keeps different warehouses in separate buckets', () => {
    const so = order({
      lineItems: [
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 3 }),
        line({ productId: 'p1', warehouseId: 'wh_jhb', quantity: 4 }),
      ],
    });
    const own = ownCommitmentMap(so, DEFAULT_WH);
    expect(own.get(commitmentKey('p1', 'wh_cpt'))).toBe(3);
    expect(own.get(commitmentKey('p1', 'wh_jhb'))).toBe(4);
  });

  it('ignores custom/service lines (no productId) and non-positive quantities', () => {
    const so = order({
      lineItems: [
        line({ warehouseId: 'wh_cpt', quantity: 5 }), // no productId
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 0 }),
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: -2 }),
      ],
    });
    expect(ownCommitmentMap(so, DEFAULT_WH).size).toBe(0);
  });
});

describe('externalCommittedFor', () => {
  it('warehouse-scoped: global minus own, floored at 0', () => {
    const global = new Map([[commitmentKey('p1', 'wh_cpt'), 12]]);
    const own = new Map([[commitmentKey('p1', 'wh_cpt'), 5]]);
    expect(externalCommittedFor(global, own, 'p1', 'wh_cpt')).toBe(7);
  });

  it('never goes negative when own exceeds global (stale map during a re-fetch)', () => {
    const global = new Map([[commitmentKey('p1', 'wh_cpt'), 3]]);
    const own = new Map([[commitmentKey('p1', 'wh_cpt'), 5]]);
    expect(externalCommittedFor(global, own, 'p1', 'wh_cpt')).toBe(0);
  });

  it('cross-warehouse (no warehouseId): sums both sides across warehouses', () => {
    const global = new Map([
      [commitmentKey('p1', 'wh_cpt'), 8],
      [commitmentKey('p1', 'wh_jhb'), 4],
    ]);
    const own = new Map([[commitmentKey('p1', 'wh_cpt'), 3]]);
    expect(getCommittedForProduct(global, 'p1')).toBe(12);
    expect(externalCommittedFor(global, own, 'p1')).toBe(9);
  });

  it('with an empty own map returns the plain global figure', () => {
    const global = new Map([[commitmentKey('p1', 'wh_cpt'), 6]]);
    expect(externalCommittedFor(global, new Map(), 'p1', 'wh_cpt')).toBe(6);
  });
});

describe('editor availability — worked scenarios from the CP-5A brief', () => {
  it('T1  pending SO 4, onHand 10 -> committed 0, available 10', async () => {
    const so = order({ status: 'pending', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 4 })] });
    const global = await globalMap([so]);
    const own = ownCommitmentMap(so, DEFAULT_WH);
    expect(externalCommittedFor(global, own, 'p1', 'wh_main')).toBe(0);
    expect(editorAvailable(10, global, own, 'p1', 'wh_main')).toBe(10);
  });

  it('T2  confirmed SO 4, onHand 10 -> global committed 4, available 6 (viewed from elsewhere: no own map)', async () => {
    const so = order({ lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 4 })] });
    const global = await globalMap([so]);
    expect(global.get(commitmentKey('p1', 'wh_main'))).toBe(4);
    expect(editorAvailable(10, global, new Map(), 'p1', 'wh_main')).toBe(6);
  });

  it('T3  was-confirmed 4 -> cancelled -> committed 0, available 10 (derived, no persistence cleanup)', async () => {
    const so = order({ status: 'cancelled', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 4 })] });
    const global = await globalMap([so]);
    expect(global.size).toBe(0);
    expect(editorAvailable(10, global, ownCommitmentMap(so, DEFAULT_WH), 'p1', 'wh_main')).toBe(10);
  });

  it('T4  confirmed 4 -> fulfilled -> committed 0', async () => {
    const so = order({ status: 'fulfilled', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 4 })] });
    const global = await globalMap([so]);
    expect(global.has(commitmentKey('p1', 'wh_main'))).toBe(false);
  });

  it('T5  SO-A confirmed 5 + SO-B confirmed 7, onHand 20 -> global committed 12, available 8', async () => {
    const soA = order({ orderNumber: 'SO-A', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 5 })] });
    const soB = order({ orderNumber: 'SO-B', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 7 })] });
    const global = await globalMap([soA, soB]);
    expect(global.get(commitmentKey('p1', 'wh_main'))).toBe(12);
    expect(editorAvailable(20, global, new Map(), 'p1', 'wh_main')).toBe(8);
  });

  it('T6  editing SO-A (5) with SO-B (7), onHand 20 -> own 5, external 7, editor available 13', async () => {
    const soA = order({ orderNumber: 'SO-A', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 5 })] });
    const soB = order({ orderNumber: 'SO-B', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 7 })] });
    const global = await globalMap([soA, soB]);
    const own = ownCommitmentMap(soA, DEFAULT_WH);
    expect(own.get(commitmentKey('p1', 'wh_main'))).toBe(5);
    expect(externalCommittedFor(global, own, 'p1', 'wh_main')).toBe(7);
    expect(editorAvailable(20, global, own, 'p1', 'wh_main')).toBe(13);
  });

  it('T7  same setup — SO-B\'s 7 still counts as external when editing SO-A', async () => {
    const soA = order({ orderNumber: 'SO-A', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 5 })] });
    const soB = order({ orderNumber: 'SO-B', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 7 })] });
    const global = await globalMap([soA, soB]);
    expect(externalCommittedFor(global, ownCommitmentMap(soA, DEFAULT_WH), 'p1', 'wh_main')).toBe(7);
  });

  it('T8  warehouse separation: SO-A P/CPT=3, P/JHB=4 -> editing SO-A subtracts 3 from CPT and 4 from JHB independently', async () => {
    const soA = order({
      orderNumber: 'SO-A',
      lineItems: [
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 3 }),
        line({ productId: 'p1', warehouseId: 'wh_jhb', quantity: 4 }),
      ],
    });
    const global = await globalMap([soA]);
    expect(global.get(commitmentKey('p1', 'wh_cpt'))).toBe(3);
    expect(global.get(commitmentKey('p1', 'wh_jhb'))).toBe(4);
    const own = ownCommitmentMap(soA, DEFAULT_WH);
    expect(externalCommittedFor(global, own, 'p1', 'wh_cpt')).toBe(0);
    expect(externalCommittedFor(global, own, 'p1', 'wh_jhb')).toBe(0);
    expect(editorAvailable(10, global, own, 'p1', 'wh_cpt')).toBe(10);
    expect(editorAvailable(20, global, own, 'p1', 'wh_jhb')).toBe(20);
  });

  it('T9  same product on two lines: SO-A P/CPT=2 and P/CPT=3 -> own commitment for P/CPT = 5', async () => {
    const soA = order({
      orderNumber: 'SO-A',
      lineItems: [
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 2 }),
        line({ productId: 'p1', warehouseId: 'wh_cpt', quantity: 3 }),
      ],
    });
    const global = await globalMap([soA]);
    const own = ownCommitmentMap(soA, DEFAULT_WH);
    expect(own.get(commitmentKey('p1', 'wh_cpt'))).toBe(5);
    expect(externalCommittedFor(global, own, 'p1', 'wh_cpt')).toBe(0);
  });

  it('T10 custom/service line (no productId) -> no commitment, own or global', async () => {
    const soA = order({ orderNumber: 'SO-A', lineItems: [line({ warehouseId: 'wh_cpt', quantity: 9 })] });
    const global = await globalMap([soA]);
    expect(global.size).toBe(0);
    expect(ownCommitmentMap(soA, DEFAULT_WH).size).toBe(0);
  });

  it('T13 no false warning from own commitment: onHand 10, SO-A confirmed 8, no others -> external 0, available 10', async () => {
    const soA = order({ orderNumber: 'SO-A', lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 8 })] });
    const global = await globalMap([soA]);
    const own = ownCommitmentMap(soA, DEFAULT_WH);
    expect(externalCommittedFor(global, own, 'p1', 'wh_main')).toBe(0);
    const available = editorAvailable(10, global, own, 'p1', 'wh_main');
    expect(available).toBe(10);
    expect(8 > available).toBe(false); // ordered (8) is NOT short of available (10) -> no warning
  });

  it('T18 fulfilled/cancelled release needs no DB mutation — recalculation alone yields the released quantity', async () => {
    const so = order({ lineItems: [line({ productId: 'p1', warehouseId: 'wh_main', quantity: 6 })] });
    expect((await globalMap([so])).get(commitmentKey('p1', 'wh_main'))).toBe(6);
    so.status = 'fulfilled';
    expect((await globalMap([so])).has(commitmentKey('p1', 'wh_main'))).toBe(false);
    so.status = 'cancelled';
    expect((await globalMap([so])).has(commitmentKey('p1', 'wh_main'))).toBe(false);
  });
});
