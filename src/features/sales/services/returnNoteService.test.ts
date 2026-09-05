import { describe, expect, it } from 'vitest';
import type { DeliveryNote, DocumentLineItem, Invoice, Product } from '@/types';
import { MockReturnNoteRepository } from '@/repositories/mock/MockReturnNoteRepository';
import { MockDeliveryNoteRepository } from '@/repositories/mock/MockDeliveryNoteRepository';
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
  ReturnNoteService,
  LocalReturnNotePoster,
  type ReturnNotePoster,
} from './returnNoteService';

const PRODUCT: Product = {
  id: 'p1', sku: 'PRN-1', name: 'Printer', type: 'good', unitPrice: 5750, costPrice: 3200,
  trackInventory: true, quantityOnHand: 100, status: 'active', createdAt: '', updatedAt: '',
};

function makeDeliveryNote(overrides: Partial<DeliveryNote> = {}): DeliveryNote {
  return {
    id: 'dn_1',
    deliveryNoteNumber: 'DN-2026-0001',
    salesOrderId: 'so_1',
    customerId: 'cust_1',
    warehouseId: 'wh_main',
    deliveryDate: '2026-09-01',
    status: 'posted',
    lineItems: [
      { id: 'dnl_1', salesOrderLineId: 'L1', productId: 'p1', description: 'Printer', quantity: 10, unitPrice: 5750, taxAmount: 8625, lineTotal: 57500 },
    ],
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

function setup(options: {
  deliveryNotes?: DeliveryNote[];
  invoices?: Invoice[];
  returnNotes?: import('@/types').ReturnNote[];
  poster?: ReturnNotePoster;
} = {}) {
  const returnNoteRepo = new MockReturnNoteRepository(options.returnNotes ?? []);
  const deliveryNoteRepo = new MockDeliveryNoteRepository(options.deliveryNotes ?? [makeDeliveryNote()]);
  const invoiceRepo = new MockInvoiceRepository(options.invoices ?? []);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const journalRepository = new MockJournalEntryRepository([]);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  const inventoryAccounts = new InventoryAccountResolverService(accountMapper, { getCategory: async () => undefined });
  const products = { getProduct: async (id: string) => (id === PRODUCT.id ? PRODUCT : undefined) };
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const service = new ReturnNoteService(
    returnNoteRepo,
    deliveryNoteRepo,
    invoiceRepo,
    accountMapper,
    inventoryAccounts,
    products,
    options.poster ?? new LocalReturnNotePoster(),
    auditLog,
  );
  return { service, returnNoteRepo, deliveryNoteRepo, invoiceRepo, auditLog };
}

describe('ReturnNoteService.createDraft', () => {
  it('creates a draft with a fresh RN number, zero accounting effect, derived from the DN', async () => {
    const { service } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    expect(rn.status).toBe('draft');
    expect(rn.returnNoteNumber).toMatch(/^RN-\d{4}-\d{4}$/);
    expect(rn.journalEntryId).toBeUndefined();
    expect(rn.customerId).toBe('cust_1'); // derived from the DN, never trusted from caller
    expect(rn.salesOrderId).toBe('so_1');
    expect(rn.warehouseId).toBe('wh_main');
    expect(rn.lineItems).toHaveLength(1);
    expect(rn.lineItems[0].quantity).toBe(3);
    expect(rn.lineItems[0].productId).toBe('p1');
    expect(rn.lineItems[0].deliveryNoteLineId).toBe('dnl_1');
  });

  it('rejects a draft delivery note — only posted stock can be returned', async () => {
    const { service } = setup({ deliveryNotes: [makeDeliveryNote({ status: 'draft' })] });
    await expect(
      service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] }),
    ).rejects.toThrow(/only a posted delivery/i);
  });

  it('rejects a line not on the delivery note', async () => {
    const { service } = setup();
    await expect(
      service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_ghost', quantity: 1 }] }),
    ).rejects.toThrow(/is not on delivery note/i);
  });

  it('rejects a zero or negative quantity', async () => {
    const { service } = setup();
    await expect(
      service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 0 }] }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it('rejects over-return beyond the delivered quantity', async () => {
    const { service } = setup();
    await expect(
      service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 11 }] }),
    ).rejects.toThrow(/only 10 remain returnable/i);
  });

  it('rejects returning already-invoiced quantity — that goes through a Credit Note instead', async () => {
    const { service, invoiceRepo } = setup();
    await invoiceRepo.create(makeInvoice(
      [{ id: 'il_1', productId: 'p1', warehouseId: 'wh_main', description: 'Printer', quantity: 6, unitPrice: 5750, taxAmount: 0, lineTotal: 0, deliveryNoteLineId: 'dnl_1' }],
      { status: 'sent' },
    ));
    // 10 delivered - 6 invoiced = 4 returnable; requesting 5 should fail
    await expect(
      service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 5 }] }),
    ).rejects.toThrow(/only 4 remain returnable/i);
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 4 }] });
    expect(rn.lineItems[0].quantity).toBe(4);
  });

  it('nets against already-posted return notes on the SAME delivery note line', async () => {
    const existingRn = {
      id: 'rn_existing', returnNoteNumber: 'RN-2026-0001', deliveryNoteId: 'dn_1', salesOrderId: 'so_1', customerId: 'cust_1', warehouseId: 'wh_main',
      returnDate: '2026-09-01', status: 'posted' as const,
      lineItems: [{ id: 'rnl_x', deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', productId: 'p1', description: 'Printer', quantity: 4, unitCost: 3200, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
      createdAt: '', updatedAt: '',
    };
    const { service } = setup({ returnNotes: [existingRn] });
    // 10 delivered - 4 already returned = 6 remaining
    await expect(
      service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 7 }] }),
    ).rejects.toThrow(/only 6 remain returnable/i);
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 6 }] });
    expect(rn.lineItems[0].quantity).toBe(6);
  });

  it('a DRAFT return note never reserves returnable quantity (mirrors a draft Delivery Note)', async () => {
    const { service } = setup();
    // creating a draft for 6 units should not block a second draft for the remaining 10 (only POSTED return notes count)
    await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 6 }] });
    const rn2 = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 10 }] });
    expect(rn2.lineItems[0].quantity).toBe(10);
  });
});

describe('ReturnNoteService.updateDraft / cancelDraft / deleteDraft', () => {
  it('updates a draft freely', async () => {
    const { service } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    const updated = await service.updateDraft(rn.id, { notes: 'Damaged in transit' });
    expect(updated.notes).toBe('Damaged in transit');
  });

  it('cancels a draft', async () => {
    const { service } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    const cancelled = await service.cancelDraft(rn.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('deletes a draft', async () => {
    const { service, returnNoteRepo } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    await service.deleteDraft(rn.id);
    expect(await returnNoteRepo.getById(rn.id)).toBeUndefined();
  });
});

describe('ReturnNoteService.postReturnNote — posted immutability contract', () => {
  it('posts a draft: status flips, journalEntryId stamped', async () => {
    const { service } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    const posted = await service.postReturnNote(rn.id);
    expect(posted.status).toBe('posted');
    expect(posted.journalEntryId).toBeDefined();
  });

  it('rejects posting an already-posted return note — the double-post guard', async () => {
    const { service } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    await service.postReturnNote(rn.id);
    await expect(service.postReturnNote(rn.id)).rejects.toThrow(/only a draft can be posted/i);
  });

  it('rejects posting against a delivery note that is no longer posted', async () => {
    const { service, deliveryNoteRepo } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    await deliveryNoteRepo.update('dn_1', { status: 'cancelled' });
    await expect(service.postReturnNote(rn.id)).rejects.toThrow(/is cancelled/i);
  });

  it('a posted return note cannot be edited beyond notes — the immutability contract', async () => {
    const { service } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    await service.postReturnNote(rn.id);
    await expect(service.updateDraft(rn.id, { lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 1 }] })).rejects.toThrow(/posted return note's accounting evidence cannot be changed/i);
    const updated = await service.updateDraft(rn.id, { notes: 'late note' });
    expect(updated.notes).toBe('late note');
  });

  it('a posted return note cannot be cancelled or deleted', async () => {
    const { service } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    await service.postReturnNote(rn.id);
    await expect(service.cancelDraft(rn.id)).rejects.toThrow(/only a draft can be cancelled/i);
    await expect(service.deleteDraft(rn.id)).rejects.toThrow(/only a draft can be deleted/i);
  });

  it('a friendly RPC/poster failure surfaces to the caller without corrupting state', async () => {
    const failingPoster: ReturnNotePoster = { post: async () => { throw new Error('post_return_note: only 2 remain returnable'); } };
    const { service, returnNoteRepo } = setup({ poster: failingPoster });
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 3 }] });
    await expect(service.postReturnNote(rn.id)).rejects.toThrow(/only 2 remain returnable/i);
    const unchanged = await returnNoteRepo.getById(rn.id);
    expect(unchanged?.status).toBe('draft');
  });

  it('rejects posting a concurrently-over-returned line (fresh returnable re-derived at post time)', async () => {
    const { service, returnNoteRepo } = setup();
    const rn = await service.createDraft({ deliveryNoteId: 'dn_1', returnDate: '2026-09-06', lines: [{ deliveryNoteLineId: 'dnl_1', quantity: 6 }] });
    // simulate another return note posting 6 units in the meantime
    await returnNoteRepo.create({
      id: '', returnNoteNumber: 'RN-CONCURRENT', deliveryNoteId: 'dn_1', salesOrderId: 'so_1', customerId: 'cust_1', warehouseId: 'wh_main', returnDate: '2026-09-05', status: 'posted',
      lineItems: [{ id: 'rnl_c', deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', productId: 'p1', description: 'Printer', quantity: 6, unitCost: 3200, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
      createdAt: '', updatedAt: '',
    });
    await expect(service.postReturnNote(rn.id)).rejects.toThrow(/only 4 remain returnable/i);
  });
});

describe('ReturnNoteService.computeReturnableForDeliveryNote', () => {
  it('returnableUninvoicedQty = max(0, deliveredQty - invoicedQty - alreadyReturnedQty)', async () => {
    const { service, invoiceRepo, returnNoteRepo } = setup();
    await invoiceRepo.create(makeInvoice(
      [{ id: 'il_1', productId: 'p1', warehouseId: 'wh_main', description: 'Printer', quantity: 6, unitPrice: 5750, taxAmount: 0, lineTotal: 0, deliveryNoteLineId: 'dnl_1' }],
      { status: 'sent' },
    ));
    await returnNoteRepo.create({
      id: '', returnNoteNumber: 'RN-1', deliveryNoteId: 'dn_1', salesOrderId: 'so_1', customerId: 'cust_1', warehouseId: 'wh_main', returnDate: '2026-09-01', status: 'posted',
      lineItems: [{ id: 'rnl_1', deliveryNoteLineId: 'dnl_1', salesOrderLineId: 'L1', productId: 'p1', description: 'Printer', quantity: 1, unitCost: 3200, unitPrice: 5750, taxAmount: 0, lineTotal: 0 }],
      createdAt: '', updatedAt: '',
    });
    const returnable = await service.computeReturnableForDeliveryNote('dn_1');
    // delivered 10, invoiced 6, previously returned 1 -> returnable 3 (matches the worked example in docs/RETURN_NOTES_DESIGN.md)
    expect(returnable[0].returnableQty).toBe(3);
  });
});
