import { describe, it, expect } from 'vitest';
import { CreditNoteService } from './creditNoteService';
import { MockCreditNoteRepository } from '@/repositories/mock/MockCreditNoteRepository';
import { InvoiceService } from '@/services/invoiceService';
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
import type { AccountingPeriod, DocumentLineItem, ID, Product, ProductCategory, Warehouse } from '@/types';

/** Records every sync() call — the spy used by the Phase 9B projection test. */
class SpyLineProjector implements IDocumentLineProjector {
  calls: { documentId: ID; lines: readonly DocumentLineItem[] }[] = [];
  async sync(documentId: ID, lines: readonly DocumentLineItem[]): Promise<void> {
    this.calls.push({ documentId, lines });
  }
}

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

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    sku: id,
    name: id,
    type: 'good',
    unitPrice: 100,
    costPrice: 40,
    trackInventory: true,
    quantityOnHand: 100,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWarehouse(id: string, isDefault = false): Warehouse {
  return { id, name: id, code: id, isDefault, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

const DEFAULT_WH = 'wh_default';

const inertEngine = {
  applyInventoryTransaction: async () => ({
    idempotent: false,
    transactionLogId: 't',
    journalEntryId: undefined,
    movementIds: [],
    warnings: [],
  }),
};
const inertResolver = { resolveForProduct: async () => 'acc_x', resolveKey: async () => 'acc_x' };
const inertProducts = { getProduct: async () => undefined };
const inertWarehouses = { getWarehouse: async () => undefined, getDefaultWarehouse: async () => undefined };

async function setup(
  options: {
    products?: Record<string, Partial<Product>>;
    categories?: Record<string, Partial<ProductCategory>>;
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

  const categoryMap = new Map<string, ProductCategory>();
  for (const [id, partial] of Object.entries(options.categories ?? {})) {
    categoryMap.set(id, { id, name: id, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...partial });
  }
  const resolver = new InventoryAccountResolverService(accountMapper, { getCategory: async (id: string) => categoryMap.get(id) });

  const productStore = new Map<string, Product>();
  for (const [id, partial] of Object.entries(options.products ?? {})) {
    const product = makeProduct(id, partial);
    productStore.set(id, product);
    store.addProduct(id, product.quantityOnHand, product.costPrice);
    store.setBalance(id, DEFAULT_WH, product.quantityOnHand);
    store.setBalance(id, 'wh_branch', product.quantityOnHand);
  }
  const products = { getProduct: async (id: string) => productStore.get(id) };

  const warehouseList = [makeWarehouse(DEFAULT_WH, true), makeWarehouse('wh_branch')];
  const warehouses = {
    getWarehouse: async (id: string) => warehouseList.find((w) => w.id === id),
    getDefaultWarehouse: async () => warehouseList.find((w) => w.isDefault),
  };

  const invoiceRepository = new MockInvoiceRepository([]);
  const invoiceService = new InvoiceService(
    invoiceRepository,
    inertEngine,
    inertResolver,
    accountMapper,
    inertProducts,
    inertWarehouses,
  );
  const invoice = await invoiceService.createInvoice({
    invoiceNumber: 'INV-2026-CN-TEST',
    customerId: 'cust_test',
    issueDate: '2026-08-01T00:00:00.000Z',
    dueDate: '2026-08-31T00:00:00.000Z',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
  });

  const creditNoteRepository = new MockCreditNoteRepository([]);
  const service = new CreditNoteService(
    creditNoteRepository,
    engine,
    invoiceService,
    accountMapper,
    resolver,
    products,
    warehouses,
    options.lineProjector,
  );

  const getJE = (id: string | undefined) => store.journalEntries.find((e) => e.id === id);
  const s = (id: string | undefined, accountId: string, side: 'debit' | 'credit') =>
    (getJE(id)?.lines ?? []).filter((l) => l.accountId === accountId).reduce((a, l) => a + l[side], 0);

  return { service, store, invoiceService, invoiceRepository, invoice, getJE, s };
}

describe('CreditNoteService', () => {
  describe('issueCreditNote', () => {
    it('posts a balanced reversal journal entry and transitions draft -> issued', async () => {
      const { service, getJE } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-1',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      expect(issued.status).toBe('issued');
      const entry = getJE(issued.journalEntryId)!;
      expect(entry.lines.reduce((a, l) => a + l.debit, 0)).toBeCloseTo(entry.lines.reduce((a, l) => a + l.credit, 0));
      expect(entry.lines.reduce((a, l) => a + l.debit, 0)).toBeCloseTo(345);
      expect(entry.lines.find((l) => l.accountId === 'acc_4000')?.debit).toBeCloseTo(300);
      expect(entry.lines.find((l) => l.accountId === 'acc_2100')?.debit).toBeCloseTo(45);
      expect(entry.lines.find((l) => l.accountId === 'acc_1100')?.credit).toBeCloseTo(345);
    });

    it('omits the VAT line when taxTotal is zero', async () => {
      const { service, getJE } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-2',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'discount',
        lineItems: [],
        subtotal: 200,
        taxTotal: 0,
        total: 200,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      expect(getJE(issued.journalEntryId)!.lines.find((l) => l.accountId === 'acc_2100')).toBeUndefined();
    });

    it('reverses COGS and restores stock exactly once for a return with a tracked line', async () => {
      const { service, store, getJE } = await setup({ products: { prod_1: { costPrice: 40 } } });
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-RETURN',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 3, unitPrice: 100, taxAmount: 45, lineTotal: 300 },
        ],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      const entry = getJE(issued.journalEntryId)!;
      expect(entry.lines.reduce((a, l) => a + l.debit, 0)).toBeCloseTo(entry.lines.reduce((a, l) => a + l.credit, 0));
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')?.debit).toBeCloseTo(120); // 3 * 40
      expect(entry.lines.find((l) => l.accountId === 'acc_5000')?.credit).toBeCloseTo(120);

      const returns = store.movements.filter((m) => m.type === 'sales_return');
      expect(returns).toHaveLength(1);
      expect(returns[0].quantityDelta).toBe(3);
      expect(store.products.get('prod_1')!.quantityOnHand).toBe(103);
    });

    it("uses a line item's explicit warehouseId for the return movement", async () => {
      const { service, store } = await setup({ products: { prod_1: {} } });
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-WH',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', warehouseId: 'wh_branch', description: 'Widget', quantity: 3, unitPrice: 100, taxAmount: 45, lineTotal: 300 },
        ],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      await service.issueCreditNote(draft.id);
      expect(store.movements.filter((m) => m.type === 'sales_return')[0].warehouseId).toBe('wh_branch');
    });

    it('does not reverse COGS or restore stock for a non-return reason, even with a product line', async () => {
      const { service, store, getJE } = await setup({ products: { prod_1: {} } });
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-PRICING',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'pricing_error',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 3, unitPrice: 100, taxAmount: 45, lineTotal: 300 },
        ],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      const entry = getJE(issued.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')).toBeUndefined();
      expect(entry.lines.find((l) => l.accountId === 'acc_5000')).toBeUndefined();
      expect(store.movements).toHaveLength(0);
    });

    it('rejects a return quantity greater than what was invoiced for that product', async () => {
      const { service, invoiceService } = await setup({ products: { prod_1: {} } });
      const invoice = await invoiceService.createInvoice({
        invoiceNumber: 'INV-FOR-RETURN-GUARD',
        customerId: 'cust_test',
        issueDate: '2026-08-01T00:00:00.000Z',
        dueDate: '2026-08-31T00:00:00.000Z',
        lineItems: [{ id: 'il_1', productId: 'prod_1', description: 'Widget', quantity: 3, unitPrice: 100, taxAmount: 45, lineTotal: 300 }],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'sent',
      });
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-OVER-RETURN',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      await expect(service.issueCreditNote(draft.id)).rejects.toThrow(/exceeds/i);
    });

    it('splits the reversal by product category and still balances', async () => {
      const { service, s } = await setup({
        products: { prod_fur: { categoryId: 'cat_fur', costPrice: 40 }, prod_sta: { categoryId: 'cat_sta', costPrice: 40 } },
        categories: {
          cat_fur: { revenueAccountId: 'acc_4000', cogsAccountId: 'acc_5000', inventoryAccountId: 'acc_1200' },
          cat_sta: { revenueAccountId: 'acc_4200', cogsAccountId: 'acc_5300', inventoryAccountId: 'acc_1200' },
        },
      });
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-SPLIT-1',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_fur', description: 'Desk', quantity: 2, unitPrice: 100, taxAmount: 30, lineTotal: 200 },
          { id: 'li_2', productId: 'prod_sta', description: 'Paper', quantity: 3, unitPrice: 100, taxAmount: 45, lineTotal: 300 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      expect(s(issued.journalEntryId, 'acc_4000', 'debit')).toBeCloseTo(200);
      expect(s(issued.journalEntryId, 'acc_4200', 'debit')).toBeCloseTo(300);
      expect(s(issued.journalEntryId, 'acc_5000', 'credit')).toBeCloseTo(80);
      expect(s(issued.journalEntryId, 'acc_5300', 'credit')).toBeCloseTo(120);
      expect(s(issued.journalEntryId, 'acc_1200', 'debit')).toBeCloseTo(200);
      expect(s(issued.journalEntryId, 'acc_1100', 'credit')).toBeCloseTo(575);
      expect(s(issued.journalEntryId, 'acc_2100', 'debit')).toBeCloseTo(75);
    });

    it('uses the generic revenue/COGS accounts when no category mapping applies', async () => {
      const { service, getJE } = await setup({ products: { prod_x: { categoryId: 'cat_none', costPrice: 40 } } });
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-SPLIT-FALLBACK',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_x', description: 'Gizmo', quantity: 3, unitPrice: 100, taxAmount: 45, lineTotal: 300 },
        ],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      const entry = getJE(issued.journalEntryId)!;
      expect(entry.lines.find((l) => l.accountId === 'acc_4000')?.debit).toBeCloseTo(300);
      expect(entry.lines.find((l) => l.accountId === 'acc_5000')?.credit).toBeCloseTo(120);
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')?.debit).toBeCloseTo(120);
    });

    it('rejects issuing a credit note that is not draft', async () => {
      const { service } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-3',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'other',
        lineItems: [],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      await expect(service.issueCreditNote(issued.id)).rejects.toThrow(/draft/i);
    });
  });

  describe('normalized-line projection (Phase 9B — docs/ACCOUNTING_RELATIONSHIPS.md §17-18)', () => {
    it('projects lineItems on create', async () => {
      const projector = new SpyLineProjector();
      const { service } = await setup({ lineProjector: projector });
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-PROJ',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'other',
        lineItems: [{ id: 'cnl_1', description: 'Adjustment', quantity: 1, unitPrice: 50, taxAmount: 7.5, lineTotal: 50 }],
        subtotal: 50,
        taxTotal: 7.5,
        total: 57.5,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      expect(projector.calls).toEqual([{ documentId: draft.id, lines: draft.lineItems }]);
    });
  });

  describe('original-line evidence (Phase 9B — docs/ACCOUNTING_RELATIONSHIPS.md §4)', () => {
    async function invoiceWithTwoLinesSameProduct(invoiceService: Awaited<ReturnType<typeof setup>>['invoiceService']) {
      return invoiceService.createInvoice({
        invoiceNumber: 'INV-TWO-LINES-SAME-PRODUCT',
        customerId: 'cust_test',
        issueDate: '2026-08-01T00:00:00.000Z',
        dueDate: '2026-08-31T00:00:00.000Z',
        lineItems: [
          { id: 'il_a', productId: 'prod_1', description: 'Widget (batch A)', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
          { id: 'il_b', productId: 'prod_1', description: 'Widget (batch B)', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'sent',
      });
    }

    it('credits a specific invoice line without touching the other line for the same product', async () => {
      const { service, invoiceService } = await setup({ products: { prod_1: {} } });
      const invoice = await invoiceWithTwoLinesSameProduct(invoiceService);

      // Return all 5 of line A — line B (also qty 5, same product) is untouched.
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-LINE-A-FULL',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', originalInvoiceLineId: 'il_a', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      expect(issued.status).toBe('issued');
    });

    it('allows partial credit of one line and rejects a second credit that would over-credit that same line', async () => {
      const { service, invoiceService } = await setup({ products: { prod_1: {} } });
      const invoice = await invoiceWithTwoLinesSameProduct(invoiceService);

      const first = await service.createCreditNote({
        creditNoteNumber: 'CN-LINE-A-PARTIAL-1',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', originalInvoiceLineId: 'il_a', description: 'Widget', quantity: 3, unitPrice: 100, taxAmount: 45, lineTotal: 300 },
        ],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issuedFirst = await service.issueCreditNote(first.id);
      expect(issuedFirst.status).toBe('issued');

      // Line A had qty 5; 3 already credited — crediting 2 more is fine (=5 total).
      const second = await service.createCreditNote({
        creditNoteNumber: 'CN-LINE-A-PARTIAL-2',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-06T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', originalInvoiceLineId: 'il_a', description: 'Widget', quantity: 2, unitPrice: 100, taxAmount: 30, lineTotal: 200 },
        ],
        subtotal: 200,
        taxTotal: 30,
        total: 230,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      expect((await service.issueCreditNote(second.id)).status).toBe('issued');

      // A third credit note against line A (now fully returned) must be rejected.
      const third = await service.createCreditNote({
        creditNoteNumber: 'CN-LINE-A-OVER',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-07T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', originalInvoiceLineId: 'il_a', description: 'Widget', quantity: 1, unitPrice: 100, taxAmount: 15, lineTotal: 100 },
        ],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      await expect(service.issueCreditNote(third.id)).rejects.toThrow(/exceeds/i);

      // Line B (same product, untouched) still has its full qty 5 available.
      const lineB = await service.createCreditNote({
        creditNoteNumber: 'CN-LINE-B-FULL',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-08T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', originalInvoiceLineId: 'il_b', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      expect((await service.issueCreditNote(lineB.id)).status).toBe('issued');
    });

    it('rejects crediting more than one specific invoice line ever invoiced, even under the old aggregate-by-product total', async () => {
      const { service, invoiceService } = await setup({ products: { prod_1: {} } });
      const invoice = await invoiceWithTwoLinesSameProduct(invoiceService);

      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-LINE-A-TOO-MUCH',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        // Line A only had qty 5 — crediting 6 against it must fail even
        // though the whole invoice (10 units across both lines) could
        // technically absorb it under the old product-only aggregate.
        lineItems: [
          { id: 'li_1', productId: 'prod_1', originalInvoiceLineId: 'il_a', description: 'Widget', quantity: 6, unitPrice: 100, taxAmount: 90, lineTotal: 600 },
        ],
        subtotal: 600,
        taxTotal: 90,
        total: 690,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      await expect(service.issueCreditNote(draft.id)).rejects.toThrow(/exceeds/i);
    });

    it('financial-only credit (no originalInvoiceLineId, non-return reason) needs no line evidence and is unaffected', async () => {
      const { service, invoiceService } = await setup({ products: { prod_1: {} } });
      const invoice = await invoiceWithTwoLinesSameProduct(invoiceService);

      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-FINANCIAL-ONLY',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'discount',
        lineItems: [
          { id: 'li_1', description: 'Volume discount', quantity: 1, unitPrice: 100, taxAmount: 15, lineTotal: 100 },
        ],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      expect((await service.issueCreditNote(draft.id)).status).toBe('issued');
    });

    it('records the credit note line id (not the original invoice line id) as the stock movement source evidence', async () => {
      const { service, invoiceService, store } = await setup({ products: { prod_1: {} } });
      const invoice = await invoiceWithTwoLinesSameProduct(invoiceService);

      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-SOURCE-EVIDENCE',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          { id: 'cn_li_1', productId: 'prod_1', originalInvoiceLineId: 'il_a', description: 'Widget', quantity: 2, unitPrice: 100, taxAmount: 30, lineTotal: 200 },
        ],
        subtotal: 200,
        taxTotal: 30,
        total: 230,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      await service.issueCreditNote(draft.id);
      const movement = store.movements.find((m) => m.type === 'sales_return');
      expect(movement?.sourceDocumentLineId).toBe('cn_li_1');
      expect(movement?.sourceDocumentType).toBe('credit_note');
    });
  });

  describe('allocateToInvoice', () => {
    it('reduces the invoice outstanding balance via InvoiceService.recordPayment', async () => {
      const { service, invoiceRepository, invoice } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-4',
        customerId: 'cust_test',
        invoiceId: invoice.id,
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [],
        subtotal: 300,
        taxTotal: 45,
        total: 345,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      const allocated = await service.allocateToInvoice(issued.id, invoice.id, 345);
      expect(allocated.amountAllocated).toBe(345);
      expect(allocated.status).toBe('allocated');
      const updatedInvoice = await invoiceRepository.getById(invoice.id);
      expect(updatedInvoice?.amountPaid).toBe(345);
      expect(updatedInvoice?.status).toBe('partially_paid');
    });

    it('rejects allocating before the credit note is issued', async () => {
      const { service, invoice } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-5',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'other',
        lineItems: [],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      await expect(service.allocateToInvoice(draft.id, invoice.id, 50)).rejects.toThrow(/issued/i);
    });
  });

  describe('voidCreditNote', () => {
    it('voids a draft credit note', async () => {
      const { service } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-7',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'other',
        lineItems: [],
        subtotal: 10,
        taxTotal: 1.5,
        total: 11.5,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      expect((await service.voidCreditNote(draft.id)).status).toBe('void');
    });

    it('rejects voiding an issued credit note', async () => {
      const { service } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-8',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'other',
        lineItems: [],
        subtotal: 10,
        taxTotal: 1.5,
        total: 11.5,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
      });
      const issued = await service.issueCreditNote(draft.id);
      await expect(service.voidCreditNote(issued.id)).rejects.toThrow(/draft/i);
    });
  });
});
