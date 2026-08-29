import { describe, it, expect, beforeEach } from 'vitest';
import { BillService, type FixedAssetCapitalizer } from './billService';
import { MockBillRepository } from '@/repositories/mock/MockBillRepository';
import { seedBills } from '@/mock-data/bills';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { CategoryAccountMappingService } from '@/features/accounting/services/categoryAccountMappingService';
import { MockCategoryAccountMappingRepository } from '@/features/accounting/repositories/MockCategoryAccountMappingRepository';
import type { CategoryAccountMappingRecord } from '@/features/accounting/repositories/ICategoryAccountMappingRepository';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { taxRateService } from '@/features/tax/services';
import type { AccountingPeriod } from '@/types';

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

/**
 * Configurable stub InventoryReceiver — `trackedProductIds` controls which
 * products isTrackedInventory() reports as tracked, and `recordedReceipts`
 * lets tests assert recordReceiptMovement() was only called AFTER a
 * successful post, matching the real InventoryPostingAdapter's contract
 * without pulling in real Product/Warehouse/StockMovement repositories
 * here (see inventoryPostingAdapter.test.ts for that).
 */
function makeInventoryReceiverStub(trackedProductIds: string[] = [], categoryByProduct: Record<string, string> = {}) {
  const recordedReceipts: { productId: string; quantity: number; unitCost: number; reference: string; warehouseId?: string }[] = [];
  return {
    isTrackedInventory: async (productId: string) => trackedProductIds.includes(productId),
    recordReceiptMovement: async (
      productId: string,
      quantity: number,
      unitCost: number,
      reference: string,
      warehouseId?: string,
    ) => {
      recordedReceipts.push({ productId, quantity, unitCost, reference, warehouseId });
    },
    getProductCategory: async (productId: string) => categoryByProduct[productId],
    recordedReceipts,
  };
}

function makeCategoryAccounts(rows: CategoryAccountMappingRecord[] = []) {
  return new CategoryAccountMappingService(new MockCategoryAccountMappingRepository(rows));
}

/**
 * Stub PurchaseOrderLookup — `receivedPOs` maps a PO id to whatever
 * `journalEntryId` its (stubbed) GRNI receipt posted, so tests can prove
 * postBill() clears GRNI instead of debiting Inventory when the linked PO
 * was already received. Empty by default: no bill in these tests is linked
 * to a GRNI-received PO unless a test explicitly configures one.
 */
function makePurchaseOrderLookupStub(receivedPOs: Record<string, string> = {}) {
  return {
    getPurchaseOrder: async (id: string) =>
      id in receivedPOs ? { journalEntryId: receivedPOs[id] } : undefined,
  };
}

/**
 * Stub FixedAssetCapitalizer — records every call so tests can assert
 * postBill() capitalized the right lines with the right details, without
 * pulling in the real FixedAssetService/repository here (see
 * fixedAssetService.test.ts for that).
 */
function makeFixedAssetCapitalizerStub() {
  const capitalized: Parameters<FixedAssetCapitalizer['capitalizeFromBillLine']>[0][] = [];
  return {
    capitalizeFromBillLine: async (input: Parameters<FixedAssetCapitalizer['capitalizeFromBillLine']>[0]) => {
      capitalized.push(input);
    },
    capitalized,
  };
}

describe('BillService', () => {
  let billService: BillService;
  let repository: MockBillRepository;
  let journalEntryService: JournalEntryService;
  let accountMapper: AccountMappingService;
  let inventoryReceiver: ReturnType<typeof makeInventoryReceiverStub>;

  beforeEach(() => {
    repository = new MockBillRepository();
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(
      journalRepository,
      accountRepository,
      periodRepository,
      auditLog,
    );
    // Real AccountMappingService (docs/SUPABASE_MIGRATION_GUIDE.md Phase
    // E.5) resolving against the same seedAccounts codes the old
    // hardcoded acc_XXXX constants used to point at directly.
    accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    inventoryReceiver = makeInventoryReceiverStub();
    billService = new BillService(
      repository,
      journalEntryService,
      taxRateService,
      inventoryReceiver,
      makePurchaseOrderLookupStub(),
      makeFixedAssetCapitalizerStub(),
      accountMapper,
    );
  });

  describe('getBills', () => {
    it('should return all bills', async () => {
      const bills = await billService.getBills();
      expect(bills).toBeDefined();
      expect(bills.length).toBeGreaterThan(0);
      expect(bills.length).toBe(seedBills.length);
    });
  });

  describe('getBill', () => {
    it('should return a bill by ID', async () => {
      const bill = await billService.getBill(seedBills[0].id);
      expect(bill).toBeDefined();
      expect(bill?.id).toBe(seedBills[0].id);
      expect(bill?.billNumber).toBe(seedBills[0].billNumber);
    });

    it('should return undefined for non-existent bill', async () => {
      const bill = await billService.getBill('non-existent-id');
      expect(bill).toBeUndefined();
    });
  });

  describe('createBill', () => {
    it('should create a new bill', async () => {
      const billData = {
        billNumber: 'BILL-2026-TEST',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          {
            id: 'li_test',
            productId: 'prod_test',
            description: 'Test Item',
            quantity: 10,
            unitPrice: 100,
            taxRateId: 'tax_rate_15',
            taxAmount: 150,
            lineTotal: 1000,
          },
        ],
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
        amountPaid: 0,
        currency: 'ZAR' as const,
        status: 'draft' as const,
      };

      const bill = await billService.createBill(billData);
      expect(bill).toBeDefined();
      expect(bill.id).toBeDefined();
      expect(bill.billNumber).toBe('BILL-2026-TEST');
      expect(bill.total).toBe(1150);
      expect(bill.status).toBe('draft');
    });
  });

  describe('updateBill', () => {
    it('should update a bill', async () => {
      const bills = await billService.getBills();
      const billToUpdate = bills[0];

      const updated = await billService.updateBill(billToUpdate.id, {
        status: 'paid',
        amountPaid: billToUpdate.total,
      });

      expect(updated.status).toBe('paid');
      expect(updated.amountPaid).toBe(billToUpdate.total);
    });

    it('should throw error for non-existent bill', async () => {
      await expect(
        billService.updateBill('non-existent-id', { status: 'paid' }),
      ).rejects.toThrow('not found');
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

      const deleted = await billService.getBill(draft.id);
      expect(deleted).toBeUndefined();
    });

    it('should refuse to delete a posted (non-draft) bill', async () => {
      const bills = await billService.getBills();
      const postedBill = bills.find((b) => b.status !== 'draft');
      expect(postedBill).toBeDefined();

      await expect(billService.deleteBill(postedBill!.id)).rejects.toThrow(/only a draft bill/i);

      const stillThere = await billService.getBill(postedBill!.id);
      expect(stillThere).toBeDefined();
    });
  });

  describe('postBill', () => {
    it('should change status from draft to awaiting_payment', async () => {
      const bills = await billService.getBills();
      const draftBill = bills.find((b) => b.status === 'draft');

      if (!draftBill) {
        // Create one
        const newBill = await billService.createBill({
          billNumber: 'BILL-2026-DRAFT',
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

        const posted = await billService.postBill(newBill.id);
        expect(posted.status).toBe('awaiting_payment');
      }
    });

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
      const entry = await journalEntryService.getAccountLedger('acc_2110');
      const vatInputLine = entry.find((row) => row.entryId === posted.journalEntryId);
      expect(vatInputLine?.debit).toBe(150);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(1000);
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

      const vatInputLedger = await journalEntryService.getAccountLedger('acc_2110');
      expect(vatInputLedger.some((row) => row.entryId === posted.journalEntryId)).toBe(false);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(460); // subtotal (400) + non-deductible VAT (60), never claimed
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

      const vatInputLedger = await journalEntryService.getAccountLedger('acc_2110');
      const vatInputLine = vatInputLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(vatInputLine?.debit).toBe(150); // only the deductible portion

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(1460); // subtotal (1400) + non-deductible VAT (60)

      const apLedger = await journalEntryService.getAccountLedger('acc_2000');
      const apLine = apLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(apLine?.credit).toBe(1610); // still the full bill total, unaffected by the split
    });

    it('conservatively treats VAT with no resolvable tax rate as non-deductible rather than claiming it', async () => {
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

      const vatInputLedger = await journalEntryService.getAccountLedger('acc_2110');
      expect(vatInputLedger.some((row) => row.entryId === posted.journalEntryId)).toBe(false);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine?.debit).toBe(575);
    });

    it('capitalizes a tracked-inventory line to the Inventory account instead of Operating Expenses, and records a receipt after posting', async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_tracked']);
      const localBillService = new BillService(repository, journalEntryService, taxRateService, trackedReceiver, makePurchaseOrderLookupStub(), makeFixedAssetCapitalizerStub(), accountMapper);

      const bill = await localBillService.createBill({
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

      const posted = await localBillService.postBill(bill.id);

      const inventoryLedger = await journalEntryService.getAccountLedger('acc_1200');
      const inventoryLine = inventoryLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(inventoryLine?.debit).toBe(500);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const expenseLine = expenseLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(expenseLine).toBeUndefined(); // nothing expensed — the whole subtotal went to Inventory

      expect(trackedReceiver.recordedReceipts).toEqual([
        { productId: 'prod_tracked', quantity: 10, unitCost: 50, reference: 'Bill BILL-INV-TRACKED' },
      ]);
    });

    it("passes a line item's warehouseId through to recordReceiptMovement", async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_tracked']);
      const localBillService = new BillService(repository, journalEntryService, taxRateService, trackedReceiver, makePurchaseOrderLookupStub(), makeFixedAssetCapitalizerStub(), accountMapper);

      const bill = await localBillService.createBill({
        billNumber: 'BILL-INV-WH',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          {
            id: 'li_1',
            productId: 'prod_tracked',
            warehouseId: 'wh_branch',
            description: 'Widgets for resale',
            quantity: 10,
            unitPrice: 50,
            taxRateId: 'tax_std_v2',
            taxAmount: 75,
            lineTotal: 500,
          },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      await localBillService.postBill(bill.id);

      expect(trackedReceiver.recordedReceipts).toEqual([
        { productId: 'prod_tracked', quantity: 10, unitCost: 50, reference: 'Bill BILL-INV-WH', warehouseId: 'wh_branch' },
      ]);
    });

    it('clears GRNI instead of debiting Inventory, and does NOT re-record the stock receipt, when the linked PO was already GRNI-received', async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_tracked']);
      const purchaseOrders = makePurchaseOrderLookupStub({ po_already_received: 'je_grni_receipt' });
      const localBillService = new BillService(repository, journalEntryService, taxRateService, trackedReceiver, purchaseOrders, makeFixedAssetCapitalizerStub(), accountMapper);

      const bill = await localBillService.createBill({
        billNumber: 'BILL-FROM-RECEIVED-PO',
        supplierId: 'sup_test',
        purchaseOrderId: 'po_already_received',
        issueDate: '2026-08-22',
        dueDate: '2026-09-22',
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

      const posted = await localBillService.postBill(bill.id);

      const inventoryLedger = await journalEntryService.getAccountLedger('acc_1200');
      expect(inventoryLedger.some((row) => row.entryId === posted.journalEntryId)).toBe(false); // Inventory NOT debited again

      const grniLedger = await journalEntryService.getAccountLedger('acc_2050');
      const grniLine = grniLedger.find((row) => row.entryId === posted.journalEntryId);
      expect(grniLine?.debit).toBe(500); // clears the liability recorded at PO-receipt time

      const totalDebit = (await journalEntryService.getEntry(posted.journalEntryId!))!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = (await journalEntryService.getEntry(posted.journalEntryId!))!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);

      expect(trackedReceiver.recordedReceipts).toEqual([]); // stock already moved at PO-receipt — not recorded again
    });

    it('splits a mixed bill between Inventory (tracked) and Expense (non-tracked) lines', async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_tracked']);
      const localBillService = new BillService(repository, journalEntryService, taxRateService, trackedReceiver, makePurchaseOrderLookupStub(), makeFixedAssetCapitalizerStub(), accountMapper);

      const bill = await localBillService.createBill({
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

      const posted = await localBillService.postBill(bill.id);

      const inventoryLedger = await journalEntryService.getAccountLedger('acc_1200');
      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const apLedger = await journalEntryService.getAccountLedger('acc_2000');

      expect(inventoryLedger.find((row) => row.entryId === posted.journalEntryId)?.debit).toBe(500);
      expect(expenseLedger.find((row) => row.entryId === posted.journalEntryId)?.debit).toBe(200);
      expect(apLedger.find((row) => row.entryId === posted.journalEntryId)?.credit).toBe(805);

      expect(trackedReceiver.recordedReceipts).toEqual([
        { productId: 'prod_tracked', quantity: 10, unitCost: 50, reference: 'Bill BILL-INV-MIXED' },
      ]);
    });

    it('capitalizes a fixedAssetDetails line to the Fixed Assets account instead of Operating Expenses, and calls the capitalizer after posting', async () => {
      const capitalizer = makeFixedAssetCapitalizerStub();
      const localBillService = new BillService(
        repository,
        journalEntryService,
        taxRateService,
        makeInventoryReceiverStub(),
        makePurchaseOrderLookupStub(),
        capitalizer,
        accountMapper,
      );

      const bill = await localBillService.createBill({
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

      const posted = await localBillService.postBill(bill.id);

      const fixedAssetLedger = await journalEntryService.getAccountLedger('acc_1500');
      expect(fixedAssetLedger.find((row) => row.entryId === posted.journalEntryId)?.debit).toBe(350000);

      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      expect(expenseLedger.find((row) => row.entryId === posted.journalEntryId)).toBeUndefined();

      expect(capitalizer.capitalized).toHaveLength(1);
      expect(capitalizer.capitalized[0]).toMatchObject({
        sourceBillId: bill.id,
        journalEntryId: posted.journalEntryId,
        name: 'Delivery Van',
        category: 'motor_vehicles',
        acquisitionDate: '2026-08-21',
        cost: 350000,
        residualValue: 50000,
        usefulLifeYears: 5,
        depreciationMethod: 'straight_line',
        taxWearTearRatePercent: 20,
      });
    });

    it('splits a bill three ways between Inventory, Fixed Assets, and Expense lines', async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_tracked']);
      const capitalizer = makeFixedAssetCapitalizerStub();
      const localBillService = new BillService(
        repository,
        journalEntryService,
        taxRateService,
        trackedReceiver,
        makePurchaseOrderLookupStub(),
        capitalizer,
        accountMapper,
      );

      const bill = await localBillService.createBill({
        billNumber: 'BILL-3WAY',
        supplierId: 'sup_test',
        issueDate: '2026-08-21',
        dueDate: '2026-09-21',
        lineItems: [
          { id: 'li_1', productId: 'prod_tracked', description: 'Widgets for resale', quantity: 10, unitPrice: 50, taxRateId: 'tax_std_v2', taxAmount: 75, lineTotal: 500 },
          { id: 'li_2', description: 'Office supplies (not tracked)', quantity: 1, unitPrice: 200, taxRateId: 'tax_std_v2', taxAmount: 30, lineTotal: 200 },
          {
            id: 'li_3',
            description: 'Office Printer',
            quantity: 1,
            unitPrice: 15000,
            taxRateId: 'tax_std_v2',
            taxAmount: 2250,
            lineTotal: 15000,
            fixedAssetDetails: {
              category: 'office_equipment',
              usefulLifeYears: 4,
              depreciationMethod: 'straight_line',
              residualValue: 0,
            },
          },
        ],
        subtotal: 15700,
        taxTotal: 2355,
        total: 18055,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const posted = await localBillService.postBill(bill.id);

      const inventoryLedger = await journalEntryService.getAccountLedger('acc_1200');
      const expenseLedger = await journalEntryService.getAccountLedger('acc_5100');
      const fixedAssetLedger = await journalEntryService.getAccountLedger('acc_1500');
      const apLedger = await journalEntryService.getAccountLedger('acc_2000');

      expect(inventoryLedger.find((row) => row.entryId === posted.journalEntryId)?.debit).toBe(500);
      expect(expenseLedger.find((row) => row.entryId === posted.journalEntryId)?.debit).toBe(200);
      expect(fixedAssetLedger.find((row) => row.entryId === posted.journalEntryId)?.debit).toBe(15000);
      expect(apLedger.find((row) => row.entryId === posted.journalEntryId)?.credit).toBe(18055);
      expect(capitalizer.capitalized).toHaveLength(1);
    });

    it('splits the capitalized Inventory debit by product category when a mapping is provided (Phase 21.3)', async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_fur', 'prod_sta'], {
        prod_fur: 'Furniture',
        prod_sta: 'Stationery',
      });
      const categoryAccounts = makeCategoryAccounts([
        { categoryName: 'Furniture', revenueAccountId: 'acc_4000', cogsAccountId: 'acc_5000', inventoryAccountId: 'acc_1200' },
        { categoryName: 'Stationery', revenueAccountId: 'acc_4200', cogsAccountId: 'acc_5300', inventoryAccountId: 'acc_1500' },
      ]);
      const localBillService = new BillService(
        repository,
        journalEntryService,
        taxRateService,
        trackedReceiver,
        makePurchaseOrderLookupStub(),
        makeFixedAssetCapitalizerStub(),
        accountMapper,
        categoryAccounts,
      );

      const bill = await localBillService.createBill({
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

      const posted = await localBillService.postBill(bill.id);
      const entry = (await journalEntryService.getEntry(posted.journalEntryId!))!;
      const sum = (accountId: string) =>
        entry.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l.debit, 0);

      expect(sum('acc_1200')).toBe(500); // furniture -> mapped inventory account
      expect(sum('acc_1500')).toBe(300); // stationery -> different mapped inventory account
      expect(entry.lines.find((l) => l.accountId === 'acc_5100')).toBeUndefined(); // nothing expensed

      const apLine = entry.lines.find((l) => l.accountId === 'acc_2000');
      expect(apLine?.credit).toBe(920);
      const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
    });

    it('falls back to the generic Inventory account for a tracked line whose category is unmapped', async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_x'], { prod_x: 'Gadgets' });
      const categoryAccounts = makeCategoryAccounts([
        { categoryName: 'Furniture', revenueAccountId: 'acc_4000', cogsAccountId: 'acc_5000', inventoryAccountId: 'acc_1500' },
      ]);
      const localBillService = new BillService(
        repository,
        journalEntryService,
        taxRateService,
        trackedReceiver,
        makePurchaseOrderLookupStub(),
        makeFixedAssetCapitalizerStub(),
        accountMapper,
        categoryAccounts,
      );

      const bill = await localBillService.createBill({
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

      const posted = await localBillService.postBill(bill.id);
      const entry = (await journalEntryService.getEntry(posted.journalEntryId!))!;
      expect(entry.lines.find((l) => l.accountId === 'acc_1200')?.debit).toBe(400); // generic INVENTORY
      expect(entry.lines.some((l) => l.accountId === 'acc_1500')).toBe(false);
    });

    it('does not record a stock receipt if GL posting fails', async () => {
      const trackedReceiver = makeInventoryReceiverStub(['prod_tracked']);
      const localBillService = new BillService(repository, journalEntryService, taxRateService, trackedReceiver, makePurchaseOrderLookupStub(), makeFixedAssetCapitalizerStub(), accountMapper);

      const bill = await localBillService.createBill({
        billNumber: 'BILL-INV-FAIL',
        supplierId: 'sup_test',
        issueDate: '2027-06-01', // outside the test period
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

      await expect(localBillService.postBill(bill.id)).rejects.toThrow(/accounting period/i);
      expect(trackedReceiver.recordedReceipts).toEqual([]);
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const bills = await billService.getBills();
      const bill = bills.find((b) => b.amountPaid === 0) || bills[3];

      const paymentAmount = bill.total / 2;
      const updated = await billService.recordPayment(bill.id, paymentAmount);

      expect(updated.amountPaid).toBe(bill.amountPaid + paymentAmount);
      if (updated.amountPaid < updated.total) {
        expect(updated.status).toBe('partially_paid');
      }
    });

    it('should mark bill as paid when fully paid', async () => {
      const bills = await billService.getBills();
      const unpaidBill = bills.find((b) => b.amountPaid === 0 && b.status !== 'paid');

      if (unpaidBill) {
        const updated = await billService.recordPayment(unpaidBill.id, unpaidBill.total);
        expect(updated.amountPaid).toBe(unpaidBill.total);
        expect(updated.status).toBe('paid');
      }
    });
  });

  describe('getBillsByStatus', () => {
    it('should return bills with specific status', async () => {
      const paidBills = await billService.getBillsByStatus('paid');
      expect(paidBills.every((b) => b.status === 'paid')).toBe(true);
    });
  });

  describe('getBillsBySupplier', () => {
    it('should return bills for specific supplier', async () => {
      const bills = await billService.getBills();
      const supplierId = bills[0].supplierId;

      const supplierBills = await billService.getBillsBySupplier(supplierId);
      expect(supplierBills.every((b) => b.supplierId === supplierId)).toBe(true);
    });
  });

  describe('getOutstandingBills', () => {
    it('should return bills not fully paid', async () => {
      const outstanding = await billService.getOutstandingBills();
      expect(outstanding.every((b) => b.amountPaid < b.total)).toBe(true);
    });
  });

  describe('calculateTotalOutstanding', () => {
    it('should calculate total outstanding amount', async () => {
      const total = await billService.calculateTotalOutstanding();
      expect(total).toBeGreaterThanOrEqual(0);
      expect(typeof total).toBe('number');
    });
  });
});
