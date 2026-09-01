import { describe, it, expect } from 'vitest';
import { InvoiceService } from './invoiceService';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { AccountingPeriodService } from '@/features/accounting/services/accountingPeriodService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { InventoryPostingEngine } from '@/features/inventory/services/inventoryPostingEngine';
import {
  FakeInventoryStore,
  FakeInventoryTransactionExecutor,
} from '@/features/inventory/services/inventoryPostingEngine.fake';
import { InventoryAccountResolverService } from '@/features/inventory/services/inventoryAccountResolver';
import { periodGuardFrom } from '@/features/inventory/services/documentInventoryPosting';
import type { IDocumentLineProjector } from '@/repositories/IDocumentLineProjector';
import type { AccountingPeriod, DocumentLineItem, ID, Invoice, Product, ProductCategory, Warehouse } from '@/types';

/** Records every sync() call — the spy used by the Phase 9B projection tests. */
class SpyLineProjector implements IDocumentLineProjector {
  calls: { documentId: ID; lines: readonly DocumentLineItem[] }[] = [];
  async sync(documentId: ID, lines: readonly DocumentLineItem[]): Promise<void> {
    this.calls.push({ documentId, lines });
  }
}

/** A single accounting period wide open enough to cover every date these tests use. */
function makeOpenPeriod(): AccountingPeriod {
  return {
    id: 'period_test_open',
    companyId: 'comp_test',
    financialYearId: 'fy_test',
    name: '2026 (test)',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'SKU-1',
    name: 'Widget',
    type: 'good',
    unitPrice: 100,
    costPrice: 0,
    trackInventory: true,
    quantityOnHand: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWarehouse(id: string, isDefault = false): Warehouse {
  return {
    id,
    name: id,
    code: id,
    isDefault,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const DEFAULT_WH = 'wh_default';

/**
 * Wires a REAL InventoryPostingEngine over the in-memory FakeInventoryStore
 * — the same ONE atomic engine production uses — plus a real
 * AccountMappingService against seedAccounts, so postInvoice() tests prove a
 * genuinely balanced SINGLE journal entry (revenue/AR/VAT AND COGS/inventory)
 * is produced and stock moves exactly once.
 */
function setup(
  initialInvoices?: Invoice[],
  options: {
    /** productId -> its current weighted-average costPrice in the ledger store. */
    costPrice?: Record<string, number>;
    /** productId -> Product overrides (categoryId, trackInventory, account overrides). */
    productOverrides?: Record<string, Partial<Product>>;
    /** categoryId -> its resolved GL accounts. */
    categories?: Record<string, Partial<ProductCategory>>;
    /** extra non-default warehouse ids that should resolve. */
    warehouses?: string[];
    /** omit the default warehouse entirely (no-warehouse-configured case). */
    noDefaultWarehouse?: boolean;
    lineProjector?: IDocumentLineProjector;
  } = {},
) {
  const accountRepository = new MockAccountRepository(seedAccounts);
  const journalRepository = new MockJournalEntryRepository([]);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  const periodService = new AccountingPeriodService(periodRepository, auditLog);

  const store = new FakeInventoryStore();
  const engine = new InventoryPostingEngine(
    new FakeInventoryTransactionExecutor(store),
    periodGuardFrom(periodService),
  );

  const categories = new Map<string, ProductCategory>();
  for (const [id, partial] of Object.entries(options.categories ?? {})) {
    categories.set(id, {
      id,
      name: id,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...partial,
    });
  }
  const resolver = new InventoryAccountResolverService(accountMapper, {
    getCategory: async (id: string) => categories.get(id),
  });

  const productStore = new Map<string, Product>();
  const seedProduct = (id: string) => {
    const product = makeProduct({ id, ...(options.productOverrides?.[id] ?? {}) });
    const cost = options.costPrice?.[id] ?? product.costPrice;
    const resolved = { ...product, costPrice: cost };
    productStore.set(id, resolved);
    store.addProduct(id, 10_000, cost); // plenty of on-hand so sales never warn
    store.setBalance(id, DEFAULT_WH, 10_000);
    for (const wh of options.warehouses ?? []) store.setBalance(id, wh, 10_000);
    return resolved;
  };
  for (const id of new Set([
    ...Object.keys(options.costPrice ?? {}),
    ...Object.keys(options.productOverrides ?? {}),
  ])) {
    seedProduct(id);
  }
  const products = { getProduct: async (id: string) => productStore.get(id) };

  const warehouseList = options.noDefaultWarehouse
    ? (options.warehouses ?? []).map((id) => makeWarehouse(id))
    : [makeWarehouse(DEFAULT_WH, true), ...(options.warehouses ?? []).map((id) => makeWarehouse(id))];
  const warehouses = {
    getWarehouse: async (id: string) => warehouseList.find((w) => w.id === id),
    getDefaultWarehouse: async () => warehouseList.find((w) => w.isDefault),
  };

  const repo = initialInvoices ? new MockInvoiceRepository(initialInvoices) : new MockInvoiceRepository();
  const service = new InvoiceService(repo, engine, resolver, accountMapper, products, warehouses, options.lineProjector);

  const getJE = (id: string | undefined) => store.journalEntries.find((e) => e.id === id);
  const sum = (id: string | undefined, accountId: string, side: 'debit' | 'credit') =>
    (getJE(id)?.lines ?? []).filter((l) => l.accountId === accountId).reduce((s, l) => s + l[side], 0);

  return { service, store, repo, seedProduct, getJE, sum };
}

describe('InvoiceService', () => {
  it('should get all invoices', async () => {
    const { service } = setup();
    const invoices = await service.getInvoices();
    expect(invoices.length).toBeGreaterThan(0);
  });

  it('should get an invoice by ID', async () => {
    const { service } = setup();
    const allInvoices = await service.getInvoices();
    const invoice = await service.getInvoice(allInvoices[0].id);
    expect(invoice).toBeDefined();
    expect(invoice?.invoiceNumber).toBe(allInvoices[0].invoiceNumber);
  });

  it('should create an invoice', async () => {
    const { service } = setup([]);
    const created = await service.createInvoice({
      invoiceNumber: 'INV-2026-0001',
      customerId: 'cust_test',
      issueDate: '2026-08-21T00:00:00.000Z',
      dueDate: '2026-09-21T00:00:00.000Z',
      lineItems: [],
      subtotal: 1000,
      taxTotal: 150,
      total: 1150,
      amountPaid: 0,
      currency: 'ZAR',
      status: 'draft',
    });
    expect(created.id).toBeDefined();
    expect(created.status).toBe('draft');
  });

  describe('normalized-line projection (Phase 9B — docs/ACCOUNTING_RELATIONSHIPS.md §17-18)', () => {
    it('projects lineItems on create, and again on an update that touches lineItems', async () => {
      const projector = new SpyLineProjector();
      const { service } = setup([], { lineProjector: projector });
      const created = await service.createInvoice({
        invoiceNumber: 'INV-2026-PROJ-1',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', description: 'Widget', quantity: 1, unitPrice: 100, taxAmount: 15, lineTotal: 100 }],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      expect(projector.calls).toHaveLength(1);
      expect(projector.calls[0]).toEqual({ documentId: created.id, lines: created.lineItems });

      await service.updateInvoice(created.id, {
        lineItems: [{ id: 'li_1', description: 'Widget (qty corrected)', quantity: 2, unitPrice: 100, taxAmount: 30, lineTotal: 200 }],
      });
      expect(projector.calls).toHaveLength(2);
      expect(projector.calls[1].lines[0].quantity).toBe(2);
    });

    it('does NOT re-project on an update that does not touch lineItems', async () => {
      const projector = new SpyLineProjector();
      const { service } = setup([], { lineProjector: projector });
      const created = await service.createInvoice({
        invoiceNumber: 'INV-2026-PROJ-2',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      expect(projector.calls).toHaveLength(1);

      await service.updateInvoice(created.id, { notes: 'internal note only' });
      expect(projector.calls).toHaveLength(1);
    });

    it('does not fail createInvoice when the projector itself throws', async () => {
      const throwingProjector: IDocumentLineProjector = {
        sync: async () => {
          throw new Error('simulated projection failure');
        },
      };
      const { service } = setup([], { lineProjector: throwingProjector });
      const created = await service.createInvoice({
        invoiceNumber: 'INV-2026-PROJ-3',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      expect(created.id).toBeDefined();
    });
  });

  describe('immutability of a posted invoice (Phase 3C item 5 — preserve + regress)', () => {
    async function createAndPost(service: ReturnType<typeof setup>['service'], n = '1') {
      const draft = await service.createInvoice({
        invoiceNumber: `INV-2026-IMMUT-${n}`,
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', description: 'Widget', quantity: 2, unitPrice: 500, taxAmount: 150, lineTotal: 1000 }],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      return service.postInvoice(draft.id);
    }

    it('a posted invoice cannot be deleted — a credit note is the correction path', async () => {
      const { service } = setup([]);
      const posted = await createAndPost(service);
      await expect(service.deleteInvoice(posted.id)).rejects.toThrow(/only a draft invoice can be deleted/i);
      await expect(service.deleteInvoice(posted.id)).rejects.toThrow(/credit note/i);
    });

    it('a draft invoice CAN be deleted', async () => {
      const { service } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-DRAFT-DEL',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await service.deleteInvoice(draft.id);
      expect(await service.getInvoice(draft.id)).toBeUndefined();
    });

    it('there is NO voidInvoice method — a posted invoice is never "voided" in place', () => {
      const { service } = setup([]);
      expect((service as unknown as Record<string, unknown>).voidInvoice).toBeUndefined();
    });

    it('a posted invoice keeps its accounting fields locked (spot-check)', async () => {
      const { service } = setup([]);
      const posted = await createAndPost(service, '2');
      await expect(service.updateInvoice(posted.id, { total: 1 })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { status: 'void' as never })).rejects.toThrow(/posted to the ledger/i);
    });
  });

  describe('updateInvoice (accounting-integrity guard)', () => {
    async function createAndPostInvoice(service: ReturnType<typeof setup>['service']) {
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-GUARD-1',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', description: 'Widget', quantity: 2, unitPrice: 500, taxAmount: 150, lineTotal: 1000 }],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      return service.postInvoice(draft.id);
    }

    it('allows freely editing a draft invoice, including line items and totals', async () => {
      const { service } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-DRAFT-EDIT',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const updated = await service.updateInvoice(draft.id, {
        invoiceNumber: 'INV-2026-DRAFT-EDIT-RENUMBERED',
        lineItems: [{ id: 'li_1', description: 'Consulting', quantity: 1, unitPrice: 800, taxAmount: 120, lineTotal: 800 }],
        subtotal: 800,
        taxTotal: 120,
        total: 920,
      });
      expect(updated.invoiceNumber).toBe('INV-2026-DRAFT-EDIT-RENUMBERED');
      expect(updated.total).toBe(920);
    });

    it('rejects changing line items/totals on a posted (sent) invoice', async () => {
      const { service } = setup([]);
      const posted = await createAndPostInvoice(service);
      await expect(
        service.updateInvoice(posted.id, {
          lineItems: [{ id: 'li_1', description: 'Widget (edited)', quantity: 99, unitPrice: 500, taxAmount: 150, lineTotal: 1000 }],
        }),
      ).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { total: 99999 })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { subtotal: 1 })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { taxTotal: 1 })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { customerId: 'cust_other' })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { issueDate: '2026-01-01T00:00:00.000Z' })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { invoiceNumber: 'INV-RENUMBERED' })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { currency: 'USD' })).rejects.toThrow(/posted to the ledger/i);
    });

    it('rejects a direct status/amountPaid/journalEntryId change that would bypass postInvoice()/recordPayment()', async () => {
      const { service } = setup([]);
      const posted = await createAndPostInvoice(service);
      await expect(service.updateInvoice(posted.id, { status: 'paid' })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { amountPaid: 1150 })).rejects.toThrow(/posted to the ledger/i);
      await expect(service.updateInvoice(posted.id, { journalEntryId: 'je_forged' })).rejects.toThrow(/posted to the ledger/i);
    });

    it('rejects an accounting-value edit on a partially-paid invoice, matching the sent-invoice rule', async () => {
      const { service } = setup([]);
      const posted = await createAndPostInvoice(service);
      const partiallyPaid = await service.recordPayment(posted.id, 500);
      expect(partiallyPaid.status).toBe('partially_paid');
      await expect(service.updateInvoice(partiallyPaid.id, { total: 1 })).rejects.toThrow(/posted to the ledger/i);
    });

    it('still allows editing dueDate and notes on a posted invoice', async () => {
      const { service } = setup([]);
      const posted = await createAndPostInvoice(service);
      const updated = await service.updateInvoice(posted.id, {
        dueDate: '2026-12-25T00:00:00.000Z',
        notes: 'Customer requested extended terms.',
      });
      expect(updated.dueDate).toBe('2026-12-25T00:00:00.000Z');
      expect(updated.notes).toBe('Customer requested extended terms.');
    });

    it('does not reject a full-object patch whose accounting fields are unchanged from what is already stored', async () => {
      const { service } = setup([]);
      const posted = await createAndPostInvoice(service);
      const updated = await service.updateInvoice(posted.id, { ...posted, notes: 'Just adding a note.' });
      expect(updated.notes).toBe('Just adding a note.');
      expect(updated.total).toBe(posted.total);
    });
  });

  describe('postInvoice / markInvoiceAsSent', () => {
    it('posts ONE balanced journal entry (AR / revenue / VAT) and transitions draft -> sent', async () => {
      const { service, getJE } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-1',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const updated = await service.markInvoiceAsSent(draft.id);
      expect(updated.status).toBe('sent');
      expect(updated.journalEntryId).toBeDefined();

      const entry = getJE(updated.journalEntryId)!;
      const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(1150);
      expect(entry.lines.find((l) => l.accountId === 'acc_1100')?.debit).toBeCloseTo(1150);
      expect(entry.lines.find((l) => l.accountId === 'acc_4000')?.credit).toBeCloseTo(1000);
      expect(entry.lines.find((l) => l.accountId === 'acc_2100')?.credit).toBeCloseTo(150);
    });

    it('omits the VAT Output line when taxTotal is zero', async () => {
      const { service, getJE } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-2',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [],
        subtotal: 500,
        taxTotal: 0,
        total: 500,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const updated = await service.postInvoice(draft.id);
      const entry = getJE(updated.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_2100')).toBeUndefined();
      const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
      expect(totalDebit).toBeCloseTo(entry.lines.reduce((s, l) => s + l.credit, 0));
      expect(totalDebit).toBeCloseTo(500);
    });

    it('rejects posting an invoice that is not draft', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const paidInvoice = allInvoices.find((inv) => inv.status === 'paid');
      expect(paidInvoice).toBeDefined();
      await expect(service.postInvoice(paidInvoice!.id)).rejects.toThrow(/draft/i);
    });

    it('does not update the invoice if GL posting fails (no open period for the date)', async () => {
      const { service, repo } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-3',
        customerId: 'cust_test',
        issueDate: '2027-06-01T00:00:00.000Z',
        dueDate: '2027-07-01T00:00:00.000Z',
        lineItems: [],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await expect(service.postInvoice(draft.id)).rejects.toThrow(/accounting period/i);
      const unchanged = await repo.getById(draft.id);
      expect(unchanged?.status).toBe('draft');
      expect(unchanged?.journalEntryId).toBeUndefined();
    });

    it('posts COGS and reduces stock exactly once, in the SAME journal entry as the revenue side', async () => {
      const { service, store, getJE } = setup([], { costPrice: { prod_1: 40 } });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-COGS',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const updated = await service.postInvoice(draft.id);
      const entry = getJE(updated.journalEntryId)!;

      // one entry, both sides
      expect(entry.lines.find((l) => l.accountId === 'acc_1100')?.debit).toBeCloseTo(575); // AR
      expect(entry.lines.find((l) => l.accountId === 'acc_4000')?.credit).toBeCloseTo(500); // revenue
      expect(entry.lines.find((l) => l.accountId === 'acc_2100')?.credit).toBeCloseTo(75); // VAT
      expect(entry.lines.find((l) => l.accountId === 'acc_5000')?.debit).toBe(200); // COGS 5 * 40
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')?.credit).toBe(200); // inventory
      expect(entry.lines.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(entry.lines.reduce((s, l) => s + l.credit, 0));

      const sales = store.movements.filter((m) => m.type === 'sale');
      expect(sales).toHaveLength(1);
      expect(sales[0].quantityDelta).toBe(-5);
      expect(sales[0].warehouseId).toBe(DEFAULT_WH);
      expect(store.products.get('prod_1')!.quantityOnHand).toBe(9_995); // reduced once
    });

    it("uses a line item's explicit warehouseId for the stock movement", async () => {
      const { service, store } = setup([], { costPrice: { prod_1: 40 }, warehouses: ['wh_branch'] });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-WH',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_1', warehouseId: 'wh_branch', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await service.postInvoice(draft.id);
      expect(store.movements.filter((m) => m.type === 'sale')[0].warehouseId).toBe('wh_branch');
    });

    it('throws (and does not post) when a tracked line has no warehouse and no default warehouse exists', async () => {
      const { service, store, repo } = setup([], { costPrice: { prod_1: 40 }, noDefaultWarehouse: true });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-NO-WH',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await expect(service.postInvoice(draft.id)).rejects.toThrow(/warehouse/i);
      expect((await repo.getById(draft.id))?.status).toBe('draft');
      expect(store.movements).toHaveLength(0);
      expect(store.journalEntries).toHaveLength(0);
    });

    it('produces no COGS leg and no stock movement for a service line (no product)', async () => {
      const { service, store, getJE } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-NOCOGS',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', description: 'Consulting (service, no product)', quantity: 1, unitPrice: 500, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const updated = await service.postInvoice(draft.id);
      const entry = getJE(updated.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_5000')).toBeUndefined();
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')).toBeUndefined();
      expect(store.movements).toHaveLength(0);
    });

    it('produces no COGS leg and no movement for a non-stock product line', async () => {
      const { service, store, getJE } = setup([], { productOverrides: { prod_svc: { trackInventory: false } } });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-NONSTOCK',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_svc', description: 'Support plan', quantity: 1, unitPrice: 500, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const updated = await service.postInvoice(draft.id);
      const entry = getJE(updated.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_5000')).toBeUndefined();
      expect(store.movements).toHaveLength(0);
    });

    it('does not reduce stock or post anything if GL posting fails', async () => {
      const { service, store } = setup([], { costPrice: { prod_1: 40 } });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-COGS-FAIL',
        customerId: 'cust_test',
        issueDate: '2027-06-01T00:00:00.000Z',
        dueDate: '2027-07-01T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await expect(service.postInvoice(draft.id)).rejects.toThrow(/accounting period/i);
      expect(store.movements).toHaveLength(0);
      expect(store.journalEntries).toHaveLength(0);
    });

    it('is idempotent on retry — a second post creates no duplicate entry or movement', async () => {
      const { service, store, repo } = setup([], { costPrice: { prod_1: 40 } });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-RETRY',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 }],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const first = await service.postInvoice(draft.id);
      // simulate a retry after the status write was lost (engine call already committed)
      await repo.update(draft.id, { status: 'draft' });
      const second = await service.postInvoice(draft.id);
      expect(second.journalEntryId).toBe(first.journalEntryId);
      expect(store.journalEntries).toHaveLength(1);
      expect(store.movements.filter((m) => m.type === 'sale')).toHaveLength(1);
      expect(store.products.get('prod_1')!.quantityOnHand).toBe(9_995);
    });
  });

  describe('postInvoice — split revenue/COGS by product category', () => {
    it('posts one revenue line and one COGS line per resolved account, and still balances', async () => {
      const { service, getJE } = setup([], {
        costPrice: { prod_fur: 40, prod_sta: 20 },
        productOverrides: { prod_fur: { categoryId: 'cat_fur' }, prod_sta: { categoryId: 'cat_sta' } },
        categories: {
          cat_fur: { revenueAccountId: 'acc_4000', cogsAccountId: 'acc_5000', inventoryAccountId: 'acc_1200' },
          cat_sta: { revenueAccountId: 'acc_4200', cogsAccountId: 'acc_5300', inventoryAccountId: 'acc_1200' },
        },
      });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-SPLIT-1',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [
          { id: 'li_1', productId: 'prod_fur', description: 'Desk', quantity: 10, unitPrice: 100, taxAmount: 150, lineTotal: 1000 },
          { id: 'li_2', productId: 'prod_sta', description: 'Paper', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 1500,
        taxTotal: 225,
        total: 1725,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await service.postInvoice(draft.id);
      const entry = getJE(posted.journalEntryId)!;
      const s = (accountId: string, side: 'debit' | 'credit') =>
        entry.lines.filter((l) => l.accountId === accountId).reduce((a, l) => a + l[side], 0);
      expect(s('acc_4000', 'credit')).toBeCloseTo(1000);
      expect(s('acc_4200', 'credit')).toBeCloseTo(500);
      expect(s('acc_5000', 'debit')).toBeCloseTo(400);
      expect(s('acc_5300', 'debit')).toBeCloseTo(100);
      expect(s('acc_1200', 'credit')).toBeCloseTo(500);
      expect(s('acc_2100', 'credit')).toBeCloseTo(225);
      expect(s('acc_1100', 'debit')).toBeCloseTo(1725);
      expect(entry.lines.reduce((a, l) => a + l.debit, 0)).toBeCloseTo(entry.lines.reduce((a, l) => a + l.credit, 0));
    });

    it('falls back to the generic Sales Revenue / COGS / Inventory accounts for an unmapped category', async () => {
      const { service, getJE } = setup([], {
        costPrice: { prod_x: 30 },
        productOverrides: { prod_x: { categoryId: 'cat_none' } },
      });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-SPLIT-FALLBACK',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_x', description: 'Gizmo', quantity: 4, unitPrice: 100, taxAmount: 60, lineTotal: 400 }],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await service.postInvoice(draft.id);
      const entry = getJE(posted.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_4000')?.credit).toBeCloseTo(400);
      expect(entry.lines.find((l) => l.accountId === 'acc_5000')?.debit).toBeCloseTo(120);
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')?.credit).toBeCloseTo(120);
    });

    it('honours a per-product account override ahead of the category', async () => {
      const { service, getJE } = setup([], {
        costPrice: { prod_o: 25 },
        productOverrides: { prod_o: { categoryId: 'cat_fur', salesAccountId: 'acc_4200', cogsAccountId: 'acc_5300' } },
        categories: { cat_fur: { revenueAccountId: 'acc_4000', cogsAccountId: 'acc_5000', inventoryAccountId: 'acc_1200' } },
      });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-OVERRIDE',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [{ id: 'li_1', productId: 'prod_o', description: 'Special', quantity: 4, unitPrice: 100, taxAmount: 60, lineTotal: 400 }],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await service.postInvoice(draft.id);
      const entry = getJE(posted.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_4200')?.credit).toBeCloseTo(400); // product override
      expect(entry.lines.find((l) => l.accountId === 'acc_5300')?.debit).toBeCloseTo(100);
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')?.credit).toBeCloseTo(100); // category inventory
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const invoice = allInvoices.find((inv) => inv.amountPaid < inv.total);
      if (invoice) {
        const updated = await service.recordPayment(invoice.id, 100);
        expect(updated.amountPaid).toBe(invoice.amountPaid + 100);
      }
    });
  });

  describe('getOutstandingAmount', () => {
    it('should calculate outstanding amount', async () => {
      const { service } = setup();
      const invoice = (await service.getInvoices())[0];
      expect(service.getOutstandingAmount(invoice)).toBe(invoice.total - invoice.amountPaid);
    });
  });

  describe('getInvoicesByStatus', () => {
    it('should get invoices by status', async () => {
      const { service } = setup();
      const draftInvoices = await service.getInvoicesByStatus('draft');
      expect(draftInvoices.every((inv) => inv.status === 'draft')).toBe(true);
    });
  });

  describe('searchInvoices', () => {
    it('should search invoices', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      if (allInvoices.length > 0) {
        const results = await service.searchInvoices(allInvoices[0].invoiceNumber);
        expect(results.some((inv) => inv.invoiceNumber === allInvoices[0].invoiceNumber)).toBe(true);
      }
    });
  });
});
