import { describe, expect, it } from 'vitest';
import type { DeliveryNote, DocumentLineItem, Invoice, Product, SalesOrder, Warehouse } from '@/types';
import { MockDeliveryNoteRepository } from '@/repositories/mock/MockDeliveryNoteRepository';
import { MockSalesOrderRepository } from '@/repositories/mock/MockSalesOrderRepository';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { AccountService } from '@/features/accounting/services/accountService';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { InventoryAccountResolverService } from '@/features/inventory/services/inventoryAccountResolver';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import {
  DeliveryNoteService,
  LocalDeliveryNotePoster,
  type DeliveryNotePoster,
} from './deliveryNoteService';

function soLine(overrides: Partial<DocumentLineItem> = {}): DocumentLineItem {
  return { id: 'L1', productId: 'p1', warehouseId: 'wh_main', description: 'Printer', quantity: 10, unitPrice: 5750, taxAmount: 8625, lineTotal: 57500, ...overrides };
}

function makeSalesOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'so_1',
    orderNumber: 'SO-1',
    customerId: 'cust_1',
    orderDate: '2026-09-01',
    lineItems: [soLine()],
    subtotal: 57500,
    taxTotal: 8625,
    total: 66125,
    currency: 'ZAR',
    status: 'confirmed',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeInvoice(lineItems: DocumentLineItem[], overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: `inv_${Math.random().toString(36).slice(2, 8)}`,
    invoiceNumber: 'INV-1',
    customerId: 'cust_1',
    salesOrderId: 'so_1',
    issueDate: '2026-09-05',
    dueDate: '2026-10-05',
    lineItems,
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

const WAREHOUSE: Warehouse = { id: 'wh_main', name: 'Main', code: 'MAIN', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };
const PRODUCT: Product = {
  id: 'p1', sku: 'PRN-1', name: 'Printer', type: 'good', unitPrice: 5750, costPrice: 3200,
  trackInventory: true, quantityOnHand: 100, status: 'active', createdAt: '', updatedAt: '',
};

function setup(options: {
  salesOrders?: SalesOrder[];
  invoices?: Invoice[];
  deliveryNotes?: DeliveryNote[];
  poster?: DeliveryNotePoster;
} = {}) {
  const deliveryNoteRepo = new MockDeliveryNoteRepository(options.deliveryNotes ?? []);
  const salesOrderRepo = new MockSalesOrderRepository(options.salesOrders ?? [makeSalesOrder()]);
  const invoiceRepo = new MockInvoiceRepository(options.invoices ?? []);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const journalRepository = new MockJournalEntryRepository([]);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  const inventoryAccounts = new InventoryAccountResolverService(accountMapper, { getCategory: async () => undefined });
  const products = { getProduct: async (id: string) => (id === PRODUCT.id ? PRODUCT : undefined) };
  const warehouses = {
    getWarehouse: async (id: string) => (id === WAREHOUSE.id ? WAREHOUSE : undefined),
    getDefaultWarehouse: async () => WAREHOUSE,
  };
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const service = new DeliveryNoteService(
    deliveryNoteRepo,
    salesOrderRepo,
    invoiceRepo,
    accountMapper,
    inventoryAccounts,
    products,
    warehouses,
    options.poster ?? new LocalDeliveryNotePoster(),
    auditLog,
  );
  return { service, deliveryNoteRepo, salesOrderRepo, invoiceRepo, auditLog };
}

describe('DeliveryNoteService.createDraft', () => {
  it('creates a draft with a fresh DN number, zero accounting effect', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    expect(dn.status).toBe('draft');
    expect(dn.deliveryNoteNumber).toMatch(/^DN-\d{4}-\d{4}$/);
    expect(dn.journalEntryId).toBeUndefined();
    expect(dn.lineItems).toHaveLength(1);
    expect(dn.lineItems[0].quantity).toBe(4);
    expect(dn.lineItems[0].productId).toBe('p1');
    expect(dn.customerId).toBe('cust_1'); // derived from the SO, never trusted from caller
  });

  it('rejects a pending sales order', async () => {
    const { service } = setup({ salesOrders: [makeSalesOrder({ status: 'pending' })] });
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] }),
    ).rejects.toThrow(/only a confirmed order/i);
  });

  it('rejects a cancelled sales order', async () => {
    const { service } = setup({ salesOrders: [makeSalesOrder({ status: 'cancelled' })] });
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] }),
    ).rejects.toThrow(/only a confirmed order/i);
  });

  it('rejects a closed sales order', async () => {
    const { service } = setup({ salesOrders: [makeSalesOrder({ status: 'closed' })] });
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] }),
    ).rejects.toThrow(/only a confirmed order/i);
  });

  it('rejects an unknown warehouse', async () => {
    const { service } = setup();
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_ghost', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] }),
    ).rejects.toThrow(/warehouse/i);
  });

  it('rejects a line not on the sales order', async () => {
    const { service } = setup();
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L999', quantity: 4 }] }),
    ).rejects.toThrow(/is not on sales order/i);
  });

  it('rejects over-delivery beyond remainingToDeliver', async () => {
    const { service } = setup();
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 11 }] }),
    ).rejects.toThrow(/only 10 remain to deliver/i);
  });

  it('rejects a zero or negative quantity', async () => {
    const { service } = setup();
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 0 }] }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('nets against already-posted Delivery Notes on the SAME order — partial delivery', async () => {
    const existingDn = {
      id: 'dn_existing', deliveryNoteNumber: 'DN-2026-0001', salesOrderId: 'so_1', customerId: 'cust_1', warehouseId: 'wh_main',
      deliveryDate: '2026-09-01', status: 'posted' as const,
      lineItems: [{ id: 'dnl_x', salesOrderLineId: 'L1', productId: 'p1', description: 'Printer', quantity: 4, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
      createdAt: '', updatedAt: '',
    };
    const { service } = setup({ deliveryNotes: [existingDn] });
    // 10 ordered - 4 already delivered = 6 remaining; requesting 7 should fail, 6 should succeed
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 7 }] }),
    ).rejects.toThrow(/only 6 remain to deliver/i);
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 6 }] });
    expect(dn.lineItems[0].quantity).toBe(6);
  });
});

describe('DeliveryNoteService.updateDraft / cancelDraft / deleteDraft', () => {
  it('updates a draft freely', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    const updated = await service.updateDraft(dn.id, { notes: 'Handle with care' });
    expect(updated.notes).toBe('Handle with care');
  });

  it('cancels a draft', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    const cancelled = await service.cancelDraft(dn.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('deletes a draft', async () => {
    const { service, deliveryNoteRepo } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await service.deleteDraft(dn.id);
    expect(await deliveryNoteRepo.getById(dn.id)).toBeUndefined();
  });
});

describe('DeliveryNoteService.postDeliveryNote — posted immutability contract', () => {
  it('posts a draft: status flips, journalEntryId stamped', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    const posted = await service.postDeliveryNote(dn.id);
    expect(posted.status).toBe('posted');
    expect(posted.journalEntryId).toBeDefined();
  });

  it('rejects posting an already-posted delivery note — the double-post guard', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await service.postDeliveryNote(dn.id);
    await expect(service.postDeliveryNote(dn.id)).rejects.toThrow(/only a draft can be posted/i);
  });

  it('rejects posting against a cancelled sales order', async () => {
    const { service, salesOrderRepo } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await salesOrderRepo.update('so_1', { status: 'cancelled' });
    await expect(service.postDeliveryNote(dn.id)).rejects.toThrow(/cancelled/i);
  });

  it('rejects posting against a closed sales order', async () => {
    const { service, salesOrderRepo } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await salesOrderRepo.update('so_1', { status: 'closed' });
    await expect(service.postDeliveryNote(dn.id)).rejects.toThrow(/closed/i);
  });

  it('a posted delivery note cannot be edited beyond notes — the immutability contract', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await service.postDeliveryNote(dn.id);
    await expect(service.updateDraft(dn.id, { warehouseId: 'wh_other' })).rejects.toThrow(/posted delivery note's accounting evidence cannot be changed/i);
    await expect(service.updateDraft(dn.id, { lines: [{ salesOrderLineId: 'L1', quantity: 1 }] })).rejects.toThrow(/posted delivery note's accounting evidence cannot be changed/i);
    // notes remains editable
    const updated = await service.updateDraft(dn.id, { notes: 'late note' });
    expect(updated.notes).toBe('late note');
  });

  it('a posted delivery note cannot be cancelled or deleted', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await service.postDeliveryNote(dn.id);
    await expect(service.cancelDraft(dn.id)).rejects.toThrow(/only a draft can be cancelled/i);
    await expect(service.deleteDraft(dn.id)).rejects.toThrow(/only a draft can be deleted/i);
  });

  it('a friendly RPC/poster failure surfaces to the caller without corrupting state', async () => {
    const failingPoster: DeliveryNotePoster = { post: async () => { throw new Error('post_delivery_note: only 2 remain to deliver'); } };
    const { service, deliveryNoteRepo } = setup({ poster: failingPoster });
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await expect(service.postDeliveryNote(dn.id)).rejects.toThrow(/only 2 remain to deliver/i);
    const unchanged = await deliveryNoteRepo.getById(dn.id);
    expect(unchanged?.status).toBe('draft');
  });

  it('rejects posting a concurrently-over-committed line (fresh remaining re-derived at post time)', async () => {
    const { service, deliveryNoteRepo } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 6 }] });
    // simulate another delivery note posting 6 units in the meantime
    await deliveryNoteRepo.create({
      id: '', deliveryNoteNumber: 'DN-CONCURRENT', salesOrderId: 'so_1', customerId: 'cust_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', status: 'posted',
      lineItems: [{ id: 'dnl_c', salesOrderLineId: 'L1', productId: 'p1', description: 'Printer', quantity: 6, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
      createdAt: '', updatedAt: '',
    });
    await expect(service.postDeliveryNote(dn.id)).rejects.toThrow(/only 4 remain to deliver/i);
  });
});

describe('DeliveryNoteService.buildInvoiceSelectionsForDeliveryNote', () => {
  it('defaults to each DN line\'s own remaining-to-invoice quantity, one selection per DN line', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 6 }] });
    const posted = await service.postDeliveryNote(dn.id);
    const selections = await service.buildInvoiceSelectionsForDeliveryNote(posted.id);
    expect(selections).toHaveLength(1);
    expect(selections[0].quantity).toBe(6);
    expect(selections[0].deliveryNoteLineId).toBe(posted.lineItems[0].id);
  });

  it('nets already-invoiced quantity against the SAME delivery note line', async () => {
    const { service, invoiceRepo } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 6 }] });
    const posted = await service.postDeliveryNote(dn.id);
    await invoiceRepo.create(makeInvoice([soLine({ id: 'il_1', quantity: 2, deliveryNoteLineId: posted.lineItems[0].id })], { status: 'sent' }));
    const selections = await service.buildInvoiceSelectionsForDeliveryNote(posted.id);
    expect(selections[0].quantity).toBe(4); // 6 - 2 already invoiced
  });

  it('rejects invoicing a draft delivery note — only posted evidence can be invoiced', async () => {
    const { service } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await expect(service.buildInvoiceSelectionsForDeliveryNote(dn.id)).rejects.toThrow(/only a posted delivery note/i);
  });

  it('throws when nothing remains to invoice on this delivery', async () => {
    const { service, invoiceRepo } = setup();
    const dn = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    const posted = await service.postDeliveryNote(dn.id);
    await invoiceRepo.create(makeInvoice([soLine({ id: 'il_1', quantity: 4, deliveryNoteLineId: posted.lineItems[0].id })], { status: 'sent' }));
    await expect(service.buildInvoiceSelectionsForDeliveryNote(posted.id)).rejects.toThrow(/nothing left to invoice/i);
  });
});

describe('DeliveryNoteService — multiple Delivery Notes against one Sales Order (Part 11)', () => {
  it('SO 10 -> DN 4 -> DN 3 -> remaining 3', async () => {
    const { service } = setup();
    const dn1 = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-05', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] });
    await service.postDeliveryNote(dn1.id);
    const dn2 = await service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-06', lines: [{ salesOrderLineId: 'L1', quantity: 3 }] });
    await service.postDeliveryNote(dn2.id);
    const fulfilment = await service.getFulfilmentForSalesOrder('so_1');
    expect(fulfilment.lines[0].deliveredQty).toBe(7);
    expect(fulfilment.lines[0].remainingToDeliver).toBe(3);
    await expect(
      service.createDraft({ salesOrderId: 'so_1', warehouseId: 'wh_main', deliveryDate: '2026-09-07', lines: [{ salesOrderLineId: 'L1', quantity: 4 }] }),
    ).rejects.toThrow(/only 3 remain to deliver/i);
  });
});
