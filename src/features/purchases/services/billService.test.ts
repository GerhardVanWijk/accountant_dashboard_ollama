import { describe, it, expect, beforeEach } from 'vitest';
import { BillService, type FixedAssetCapitalizer } from './billService';
import { MockBillRepository } from '@/repositories/mock/MockBillRepository';
import { seedBills } from '@/mock-data/bills';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { AccountingPeriodService } from '@/features/accounting/services/accountingPeriodService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { taxRateService } from '@/features/tax/services';
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

function makePurchaseOrderLookupStub(receivedPOs: Record<string, string> = {}) {
  return {
    getPurchaseOrder: async (id: string) =>
      id in receivedPOs ? { journalEntryId: receivedPOs[id] } : undefined,
  };
}

function makeFixedAssetCapitalizerStub() {
  const capitalized: Parameters<FixedAssetCapitalizer['capitalizeFromBillLine']>[0][] = [];
  return {
    capitalizeFromBillLine: async (input: Parameters<FixedAssetCapitalizer['capitalizeFromBillLine']>[0]) => {
      capitalized.push(input);
    },
    capitalized,
  };
}

/**
 * Real InventoryPostingEngine over an in-memory FakeInventoryStore + real
 * AccountMappingService against seedAccounts. `postBill()` posts a SINGLE
 * journal entry through the engine; assertions read `store.journalEntries`.
 */
function makeHarness(options: {
  trackedProducts?: Record<string, Partial<Product>>;
  categories?: Record<string, Partial<ProductCategory>>;
  purchaseOrders?: Record<string, string>;
  lineProjector?: IDocumentLineProjector;
} = {}) {
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
    categoryMap.set(id, {
      id,
      name: id,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...partial,
    });
  }
  const resolver = new InventoryAccountResolverService(accountMapper, {
    getCategory: async (id: string) => categoryMap.get(id),
  });

  const productStore = new Map<string, Product>();
  for (const [id, partial] of Object.entries(options.trackedProducts ?? {})) {
    const product = makeProduct(id, partial);
    productStore.set(id, product);
    store.addProduct(id, product.quantityOnHand, product.costPrice);
  }
  const products = { getProduct: async (id: string) => productStore.get(id) };

  const warehouseList = [makeWarehouse(DEFAULT_WH, true), makeWarehouse('wh_branch')];
  const warehouses = {
    getWarehouse: async (id: string) => warehouseList.find((w) => w.id === id),
    getDefaultWarehouse: async () => warehouseList.find((w) => w.isDefault),
  };

  const repository = new MockBillRepository();
  const capitalizer = makeFixedAssetCapitalizerStub();
  const service = new BillService(
    repository,
    engine,
    taxRateService,
    makePurchaseOrderLookupStub(options.purchaseOrders),
    capitalizer,
    accountMapper,
    resolver,
    products,
    warehouses,
    options.lineProjector,
  );

  const getJE = (id: string | undefined) => store.journalEntries.find((e) => e.id === id);
  const line = (id: string | undefined, accountId: string, side: 'debit' | 'credit') =>
    getJE(id)?.lines.find((l) => l.accountId === accountId)?.[side];
  const balanced = (id: string | undefined) => {
    const e = getJE(id)!;
    return e.lines.reduce((s, l) => s + l.debit, 0) === e.lines.reduce((s, l) => s + l.credit, 0);
  };

  return { service, repository, store, capitalizer, getJE, line, balanced };
}

describe('BillService', () => {
  let harness: ReturnType<typeof makeHarness>;
  let billService: BillService;

  beforeEach(() => {
    harness = makeHarness();
    billService = harness.service;
  });

  describe('getBills', () => {
    it('should return all bills', async () => {
      const bills = await billService.getBills();
      expect(bills.length).toBe(seedBills.length);
    });
  });

  describe('getBill', () => {
    it('should return a bill by ID', async () => {
      const bill = await billService.getBill(seedBills[0].id);
      expect(bill?.id).toBe(seedBills[0].id);
    });

    it('should return undefined for non-existent bill', async () => {
      expect(await billService.getBill('non-existent-id')).toBeUndefined();
    });
  });

  describe('createBill', () => {
    it('should create a new bill', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-2026-TEST',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      expect(bill.billNumber).toBe('BILL-2026-TEST');
      expect(bill.status).toBe('draft');
    });

    it('projects lineItems into the normalized-line projector (Phase 9B — docs/ACCOUNTING_RELATIONSHIPS.md §17-18)', async () => {
      const projector = new SpyLineProjector();
      const { service } = makeHarness({ lineProjector: projector });
      const bill = await service.createBill({
        billNumber: 'BILL-2026-PROJ',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [{ id: 'bl_1', description: 'Freight', quantity: 1, unitPrice: 50, taxAmount: 7.5, lineTotal: 50 }],
        subtotal: 50,
        taxTotal: 7.5,
        total: 57.5,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      expect(projector.calls).toEqual([{ documentId: bill.id, lines: bill.lineItems }]);
    });
  });

  describe('updateBill', () => {
    it('edits a DRAFT bill', async () => {
      const draft = await billService.createBill({
        billNumber: 'BILL-DRAFT-EDIT',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 100,
        taxTotal: 15,
        total: 115,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const updated = await billService.updateBill(draft.id, { subtotal: 200 });
      expect(updated.subtotal).toBe(200);
    });

    it('should throw error for non-existent bill', async () => {
      await expect(billService.updateBill('non-existent-id', { status: 'paid' })).rejects.toThrow('not found');
    });

    it('REJECTS editing a posted bill — a posted bill is immutable (item 5)', async () => {
      const posted = (await billService.getBills()).find((b) => b.status !== 'draft')!;
      await expect(billService.updateBill(posted.id, { supplierId: 'x' })).rejects.toThrow(/immutable/i);
      await expect(billService.updateBill(posted.id, { total: 999 })).rejects.toThrow(/immutable/i);
      await expect(billService.updateBill(posted.id, { issueDate: '2020-01-01' })).rejects.toThrow(/immutable/i);
    });
  });

  describe('immutability of a posted bill (Phase 3C item 5)', () => {
    it('a posted bill cannot be deleted', async () => {
      const posted = (await billService.getBills()).find((b) => b.status !== 'draft')!;
      await expect(billService.deleteBill(posted.id)).rejects.toThrow(/only a draft bill/i);
    });

    it('a posted bill cannot be voided — voidBill is draft-only', async () => {
      const posted = (await billService.getBills()).find((b) => b.status !== 'draft')!;
      await expect(billService.voidBill(posted.id)).rejects.toThrow(/only a draft bill can be voided/i);
    });

    it('a draft bill CAN be voided', async () => {
      const draft = await billService.createBill({
        billNumber: 'BILL-DRAFT-VOID',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      expect((await billService.voidBill(draft.id)).status).toBe('void');
    });

    it('a posted inventory bill stays GL/stock-consistent — no mutation path leaves it inconsistent', async () => {
      const h = makeHarness({ trackedProducts: { prod_tracked: {} } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-INV-IMMUT',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      const je = h.store.journalEntries;
      const movements = h.store.movements.length;

      await expect(h.service.updateBill(bill.id, { total: 1 })).rejects.toThrow(/immutable/i);
      await expect(h.service.voidBill(bill.id)).rejects.toThrow(/only a draft bill can be voided/i);
      await expect(h.service.deleteBill(bill.id)).rejects.toThrow(/only a draft bill/i);

      // nothing changed: the journal entry and stock movements are exactly as posted
      expect(h.store.journalEntries).toBe(je);
      expect(h.store.movements).toHaveLength(movements);
      expect((await h.service.getBill(bill.id))!.journalEntryId).toBe(posted.journalEntryId);
    });
  });

  describe('deleteBill', () => {
    it('should delete a draft bill', async () => {
      const draft = await billService.createBill({
        billNumber: 'BILL-2026-DRAFT-DELETE',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await billService.deleteBill(draft.id);
      expect(await billService.getBill(draft.id)).toBeUndefined();
    });

    it('should refuse to delete a posted (non-draft) bill', async () => {
      const postedBill = (await billService.getBills()).find((b) => b.status !== 'draft')!;
      await expect(billService.deleteBill(postedBill.id)).rejects.toThrow(/only a draft bill/i);
    });
  });

  describe('postBill', () => {
    it('posts the full VAT to VAT Input when every line is deductible', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-STD',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Standard-rated supplies', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std_v2', taxAmount: 150, lineTotal: 1000 },
        ],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await billService.postBill(bill.id);
      expect(harness.line(posted.journalEntryId, 'acc_2110', 'debit')).toBe(150);
      expect(harness.line(posted.journalEntryId, 'acc_5100', 'debit')).toBe(1000);
      expect(harness.balanced(posted.journalEntryId)).toBe(true);
    });

    it('folds non-deductible VAT into the expense line instead of posting it to VAT Input', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-NODEDUCT',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Client entertainment', quantity: 1, unitPrice: 400, taxRateId: 'tax_nondeductible', taxAmount: 60, lineTotal: 400 },
        ],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await billService.postBill(bill.id);
      expect(harness.line(posted.journalEntryId, 'acc_2110', 'debit')).toBeUndefined();
      expect(harness.line(posted.journalEntryId, 'acc_5100', 'debit')).toBe(460);
    });

    it('splits a mixed bill correctly between deductible and non-deductible VAT', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-MIXED',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Supplies', quantity: 1, unitPrice: 1000, taxRateId: 'tax_std_v2', taxAmount: 150, lineTotal: 1000 },
          { id: 'li_2', description: 'Client entertainment', quantity: 1, unitPrice: 400, taxRateId: 'tax_nondeductible', taxAmount: 60, lineTotal: 400 },
        ],
        subtotal: 1400,
        taxTotal: 210,
        total: 1610,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await billService.postBill(bill.id);
      expect(harness.line(posted.journalEntryId, 'acc_2110', 'debit')).toBe(150);
      expect(harness.line(posted.journalEntryId, 'acc_5100', 'debit')).toBe(1460);
      expect(harness.line(posted.journalEntryId, 'acc_2000', 'credit')).toBe(1610);
    });

    it('conservatively treats VAT with no resolvable tax rate as non-deductible', async () => {
      const bill = await billService.createBill({
        billNumber: 'BILL-VAT-UNRESOLVED',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', description: 'Mystery supplies', quantity: 1, unitPrice: 500, taxRateId: 'tax_does_not_exist', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await billService.postBill(bill.id);
      expect(harness.line(posted.journalEntryId, 'acc_2110', 'debit')).toBeUndefined();
      expect(harness.line(posted.journalEntryId, 'acc_5100', 'debit')).toBe(575);
    });

    it('capitalizes a tracked-inventory line to Inventory, moves stock once, in ONE entry', async () => {
      const h = makeHarness({ trackedProducts: { prod_tracked: {} } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-INV-TRACKED',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets for resale', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      expect(h.line(posted.journalEntryId, 'acc_1200', 'debit')).toBe(500);
      expect(h.line(posted.journalEntryId, 'acc_5100', 'debit')).toBeUndefined();
      expect(h.line(posted.journalEntryId, 'acc_2000', 'credit')).toBe(575);
      expect(h.balanced(posted.journalEntryId)).toBe(true);

      const receipts = h.store.movements.filter((m) => m.type === 'goods_received');
      expect(receipts).toHaveLength(1);
      expect(receipts[0].quantityDelta).toBe(10);
      expect(receipts[0].unitCost).toBe(50);
      expect(h.store.products.get('prod_tracked')!.costPrice).toBe(50); // WAC blended once
    });

    it("uses a line item's explicit warehouseId for the receipt movement", async () => {
      const h = makeHarness({ trackedProducts: { prod_tracked: {} } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-INV-WH',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', warehouseId: 'wh_branch', description: 'Widgets', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await h.service.postBill(bill.id);
      expect(h.store.movements.filter((m) => m.type === 'goods_received')[0].warehouseId).toBe('wh_branch');
    });

    it('clears GRNI (not Inventory) and does NOT re-record stock when the linked PO was already GRNI-received', async () => {
      const h = makeHarness({
        trackedProducts: { prod_tracked: {} },
        purchaseOrders: { po_already_received: 'je_grni_receipt' },
      });
      const bill = await h.service.createBill({
        billNumber: 'BILL-FROM-RECEIVED-PO',
        supplierId: 'sup_test',
        purchaseOrderId: 'po_already_received',
        issueDate: '2026-08-22',
        dueDate: '2026-09-22',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      expect(h.line(posted.journalEntryId, 'acc_1200', 'debit')).toBeUndefined(); // Inventory NOT debited again
      expect(h.line(posted.journalEntryId, 'acc_2050', 'debit')).toBe(500); // GRNI cleared
      expect(h.line(posted.journalEntryId, 'acc_2000', 'credit')).toBe(575);
      expect(h.balanced(posted.journalEntryId)).toBe(true);
      expect(h.store.movements).toHaveLength(0); // stock already moved at PO-receipt
    });

    it('splits a mixed bill between Inventory (tracked) and Expense (non-tracked) lines', async () => {
      const h = makeHarness({ trackedProducts: { prod_tracked: {} } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-INV-MIXED',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets for resale', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
          { id: 'li_2', description: 'Office supplies (not tracked)', quantity: 1, unitPrice: 200, taxRateId: 'tax_std_v2', taxAmount: 30, lineTotal: 200 },
        ],
        subtotal: 700,
        taxTotal: 105,
        total: 805,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      expect(h.line(posted.journalEntryId, 'acc_1200', 'debit')).toBe(500);
      expect(h.line(posted.journalEntryId, 'acc_5100', 'debit')).toBe(200);
      expect(h.line(posted.journalEntryId, 'acc_2000', 'credit')).toBe(805);
      expect(h.balanced(posted.journalEntryId)).toBe(true);
    });

    it('capitalizes a fixedAssetDetails line to Fixed Assets and calls the capitalizer after posting', async () => {
      const h = makeHarness();
      const bill = await h.service.createBill({
        billNumber: 'BILL-FA-1',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          {
            id: 'li_1',
            description: 'Delivery Van',
            quantity: 1,
            unitPrice: 350000,
            taxRateId: 'tax_std_v2',
            taxAmount: 52500,
            lineTotal: 350000,
            fixedAssetDetails: {
              category: 'motor_vehicles',
              usefulLifeYears: 5,
              depreciationMethod: 'straight_line',
              residualValue: 50000,
              taxWearTearRatePercent: 20,
            },
          },
        ],
        subtotal: 350000,
        taxTotal: 52500,
        total: 402500,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      expect(h.line(posted.journalEntryId, 'acc_1500', 'debit')).toBe(350000);
      expect(h.line(posted.journalEntryId, 'acc_5100', 'debit')).toBeUndefined();
      expect(h.capitalizer.capitalized).toHaveLength(1);
      expect(h.capitalizer.capitalized[0]).toMatchObject({
        sourceBillId: bill.id,
        journalEntryId: posted.journalEntryId,
        name: 'Delivery Van',
        category: 'motor_vehicles',
        cost: 350000,
      });
    });

    it('splits a bill three ways between Inventory, Fixed Assets, and Expense', async () => {
      const h = makeHarness({ trackedProducts: { prod_tracked: {} } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-3WAY',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
          { id: 'li_2', description: 'Office supplies', quantity: 1, unitPrice: 200, taxRateId: 'tax_std_v2', taxAmount: 30, lineTotal: 200 },
          {
            id: 'li_3',
            description: 'Office Printer',
            quantity: 1,
            unitPrice: 15000,
            taxRateId: 'tax_std_v2',
            taxAmount: 2250,
            lineTotal: 15000,
            fixedAssetDetails: { category: 'office_equipment', usefulLifeYears: 4, depreciationMethod: 'straight_line', residualValue: 0 },
          },
        ],
        subtotal: 15700,
        taxTotal: 2355,
        total: 18055,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      expect(h.line(posted.journalEntryId, 'acc_1200', 'debit')).toBe(500);
      expect(h.line(posted.journalEntryId, 'acc_5100', 'debit')).toBe(200);
      expect(h.line(posted.journalEntryId, 'acc_1500', 'debit')).toBe(15000);
      expect(h.line(posted.journalEntryId, 'acc_2000', 'credit')).toBe(18055);
      expect(h.capitalizer.capitalized).toHaveLength(1);
      expect(h.balanced(posted.journalEntryId)).toBe(true);
    });

    it('splits the capitalized Inventory debit by product category', async () => {
      const h = makeHarness({
        trackedProducts: { prod_fur: { categoryId: 'cat_fur' }, prod_sta: { categoryId: 'cat_sta' } },
        categories: {
          cat_fur: { inventoryAccountId: 'acc_1200' },
          cat_sta: { inventoryAccountId: 'acc_1500' },
        },
      });
      const bill = await h.service.createBill({
        billNumber: 'BILL-INV-SPLIT',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_fur', description: 'Desks', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
          { id: 'li_2', productId: 'prod_sta', description: 'Paper', quantity: 3, unitPrice: 100, taxRateId: 'tax_std_v2', taxAmount: 45, lineTotal: 300 },
        ],
        subtotal: 800,
        taxTotal: 120,
        total: 920,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      expect(h.line(posted.journalEntryId, 'acc_1200', 'debit')).toBe(500);
      expect(h.line(posted.journalEntryId, 'acc_1500', 'debit')).toBe(300);
      expect(h.line(posted.journalEntryId, 'acc_5100', 'debit')).toBeUndefined();
      expect(h.line(posted.journalEntryId, 'acc_2000', 'credit')).toBe(920);
      expect(h.balanced(posted.journalEntryId)).toBe(true);
    });

    it('falls back to the generic Inventory account for a tracked line whose category is unmapped', async () => {
      const h = makeHarness({ trackedProducts: { prod_x: { categoryId: 'cat_none' } } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-INV-SPLIT-FALLBACK',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_x', description: 'Gizmos', quantity: 4, unitPrice: 100, taxRateId: 'tax_std_v2', taxAmount: 60, lineTotal: 400 },
        ],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const posted = await h.service.postBill(bill.id);
      expect(h.line(posted.journalEntryId, 'acc_1200', 'debit')).toBe(400);
      expect(h.line(posted.journalEntryId, 'acc_1500', 'debit')).toBeUndefined();
    });

    it('does not record a stock receipt or post anything if GL posting fails', async () => {
      const h = makeHarness({ trackedProducts: { prod_tracked: {} } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-INV-FAIL',
        supplierId: 'sup_test',
        issueDate: '2027-06-01',
        dueDate: '2027-07-01',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      await expect(h.service.postBill(bill.id)).rejects.toThrow(/accounting period/i);
      expect(h.store.movements).toHaveLength(0);
      expect(h.store.journalEntries).toHaveLength(0);
    });

    it('is idempotent on retry — no duplicate entry or movement', async () => {
      const h = makeHarness({ trackedProducts: { prod_tracked: {} } });
      const bill = await h.service.createBill({
        billNumber: 'BILL-RETRY',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });
      const first = await h.service.postBill(bill.id);
      await h.repository.update(bill.id, { status: 'draft' });
      const second = await h.service.postBill(bill.id);
      expect(second.journalEntryId).toBe(first.journalEntryId);
      expect(h.store.journalEntries).toHaveLength(1);
      expect(h.store.movements.filter((m) => m.type === 'goods_received')).toHaveLength(1);
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const bills = await billService.getBills();
      const bill = bills.find((b) => b.amountPaid === 0) || bills[3];
      const updated = await billService.recordPayment(bill.id, bill.total / 2);
      expect(updated.amountPaid).toBe(bill.amountPaid + bill.total / 2);
    });
  });

  describe('getBillsByStatus', () => {
    it('should return bills with specific status', async () => {
      const paidBills = await billService.getBillsByStatus('paid');
      expect(paidBills.every((b) => b.status === 'paid')).toBe(true);
    });
  });
});
