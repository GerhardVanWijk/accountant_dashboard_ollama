import { describe, it, expect } from 'vitest';
import { InvoiceService } from './invoiceService';
import { MockInvoiceRepository } from '@/repositories/mock/MockInvoiceRepository';
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
import type { AccountingPeriod, Invoice } from '@/types';

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
 * Configurable stub InventoryMover — `costPerUnit` controls what
 * calculateCogs() returns per product (0 = not tracked/no COGS), and
 * `recordedSales` lets tests assert recordSaleMovement() was only called
 * AFTER a successful post, matching real InventoryPostingAdapter's
 * contract without pulling in real Product/Warehouse/StockMovement
 * repositories here (see inventoryPostingAdapter.test.ts for that).
 */
function makeInventoryMoverStub(
  costPerUnit: Record<string, number> = {},
  categoryByProduct: Record<string, string> = {},
) {
  const recordedSales: { productId: string; quantity: number; reference: string; warehouseId?: string }[] = [];
  return {
    calculateCogs: async (productId: string, quantity: number) => (costPerUnit[productId] ?? 0) * quantity,
    recordSaleMovement: async (productId: string, quantity: number, reference: string, warehouseId?: string) => {
      recordedSales.push({ productId, quantity, reference, warehouseId });
    },
    getProductCategory: async (productId: string) => categoryByProduct[productId],
    recordedSales,
  };
}

/**
 * Wires a REAL JournalEntryService (the actual ledger posting engine, not a
 * stub) so postInvoice() tests prove a genuinely balanced journal entry is
 * produced, not a mocked assertion — mirrors
 * src/features/banking/services/bankTransactionService.test.ts.
 */
function setup(
  initialInvoices?: Invoice[],
  costPerUnit: Record<string, number> = {},
  options: { categoryByProduct?: Record<string, string>; categoryMappings?: CategoryAccountMappingRecord[] } = {},
) {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  const categoryAccounts = new CategoryAccountMappingService(
    new MockCategoryAccountMappingRepository(options.categoryMappings ?? []),
  );

  const repo = initialInvoices ? new MockInvoiceRepository(initialInvoices) : new MockInvoiceRepository();
  const inventoryMover = makeInventoryMoverStub(costPerUnit, options.categoryByProduct ?? {});
  const service = new InvoiceService(repo, journalEntryService, inventoryMover, accountMapper, categoryAccounts);

  return { service, journalEntryService, repo, inventoryMover };
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
    expect(created.invoiceNumber).toBe('INV-2026-0001');
    expect(created.status).toBe('draft');
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

      // A caller submitting the whole invoice back (e.g. a form that always
      // sends every field) should not be blocked just because a protected
      // key is present — only an actual attempted change is rejected.
      const updated = await service.updateInvoice(posted.id, {
        ...posted,
        notes: 'Just adding a note.',
      });

      expect(updated.notes).toBe('Just adding a note.');
      expect(updated.total).toBe(posted.total);
    });
  });

  describe('postInvoice / markInvoiceAsSent', () => {
    it('posts a balanced journal entry and transitions draft -> sent', async () => {
      const { service, journalEntryService } = setup([]);
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

      const entry = await journalEntryService.getEntry(updated.journalEntryId!);
      expect(entry).toBeDefined();
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(1150);

      const arLine = entry!.lines.find((l) => l.accountId === 'acc_1100');
      const revenueLine = entry!.lines.find((l) => l.accountId === 'acc_4000');
      const vatLine = entry!.lines.find((l) => l.accountId === 'acc_2100');
      expect(arLine?.debit).toBeCloseTo(1150);
      expect(revenueLine?.credit).toBeCloseTo(1000);
      expect(vatLine?.credit).toBeCloseTo(150);
    });

    it('omits the VAT Output line when taxTotal is zero', async () => {
      const { service, journalEntryService } = setup([]);
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
      const entry = await journalEntryService.getEntry(updated.journalEntryId!);
      const vatLine = entry!.lines.find((l) => l.accountId === 'acc_2100');
      expect(vatLine).toBeUndefined();

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
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
        issueDate: '2027-06-01T00:00:00.000Z', // outside the test period (2026 only)
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

    it('posts Cost of Sales and reduces stock for a line item with a tracked product', async () => {
      const { service, journalEntryService, inventoryMover } = setup([], { prod_1: 40 }); // costPrice 40/unit
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-COGS',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const updated = await service.postInvoice(draft.id);
      const entry = await journalEntryService.getEntry(updated.journalEntryId!);

      const cogsLine = entry!.lines.find((l) => l.accountId === 'acc_5000');
      const inventoryLine = entry!.lines.find((l) => l.accountId === 'acc_1200');
      expect(cogsLine?.debit).toBe(200); // 5 units * 40
      expect(inventoryLine?.credit).toBe(200);

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);

      expect(inventoryMover.recordedSales).toEqual([{ productId: 'prod_1', quantity: 5, reference: 'Invoice INV-2026-TEST-COGS' }]);
    });

    it("passes a line item's warehouseId through to recordSaleMovement", async () => {
      const { service, inventoryMover } = setup([], { prod_1: 40 });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-WH',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [
          {
            id: 'li_1',
            productId: 'prod_1',
            warehouseId: 'wh_branch',
            description: 'Widget',
            quantity: 5,
            unitPrice: 100,
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

      await service.postInvoice(draft.id);
      expect(inventoryMover.recordedSales).toEqual([
        { productId: 'prod_1', quantity: 5, reference: 'Invoice INV-2026-TEST-WH', warehouseId: 'wh_branch' },
      ]);
    });

    it('omits the Cost of Sales lines and does not touch stock for a line item with no tracked product', async () => {
      const { service, journalEntryService, inventoryMover } = setup([]);
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-NOCOGS',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [
          { id: 'li_1', description: 'Consulting (service, no product)', quantity: 1, unitPrice: 500, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const updated = await service.postInvoice(draft.id);
      const entry = await journalEntryService.getEntry(updated.journalEntryId!);

      expect(entry!.lines.find((l) => l.accountId === 'acc_5000')).toBeUndefined();
      expect(entry!.lines.find((l) => l.accountId === 'acc_1200')).toBeUndefined();
      expect(inventoryMover.recordedSales).toEqual([]);
    });

    it('does not reduce stock if GL posting fails', async () => {
      const { service, inventoryMover } = setup([], { prod_1: 40 });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-2026-TEST-COGS-FAIL',
        customerId: 'cust_test',
        issueDate: '2027-06-01T00:00:00.000Z', // outside the test period
        dueDate: '2027-07-01T00:00:00.000Z',
        lineItems: [
          { id: 'li_1', productId: 'prod_1', description: 'Widget', quantity: 5, unitPrice: 100, taxAmount: 75, lineTotal: 500 },
        ],
        subtotal: 500,
        taxTotal: 75,
        total: 575,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      await expect(service.postInvoice(draft.id)).rejects.toThrow(/accounting period/i);
      expect(inventoryMover.recordedSales).toEqual([]);
    });
  });

  describe('postInvoice — split revenue/COGS by product category (Phase 21.3)', () => {
    // Furniture -> 4000/5000, Stationery -> 4200/5300, both inventory -> 1200.
    const CATEGORY_MAPPINGS = [
      { categoryName: 'Furniture', revenueAccountId: 'acc_4000', cogsAccountId: 'acc_5000', inventoryAccountId: 'acc_1200' },
      { categoryName: 'Stationery', revenueAccountId: 'acc_4200', cogsAccountId: 'acc_5300', inventoryAccountId: 'acc_1200' },
    ];

    it('posts one revenue line and one COGS line per resolved account, and still balances', async () => {
      const { service, journalEntryService } = setup([], { prod_fur: 40, prod_sta: 20 }, {
        categoryByProduct: { prod_fur: 'Furniture', prod_sta: 'Stationery' },
        categoryMappings: CATEGORY_MAPPINGS,
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
      const entry = await journalEntryService.getEntry(posted.journalEntryId!);
      const sum = (accountId: string, side: 'debit' | 'credit') =>
        entry!.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l[side], 0);

      expect(sum('acc_4000', 'credit')).toBeCloseTo(1000); // furniture revenue
      expect(sum('acc_4200', 'credit')).toBeCloseTo(500); // stationery revenue
      expect(sum('acc_5000', 'debit')).toBeCloseTo(400); // furniture COGS (10 * 40)
      expect(sum('acc_5300', 'debit')).toBeCloseTo(100); // stationery COGS (5 * 20)
      expect(sum('acc_1200', 'credit')).toBeCloseTo(500); // one lumped inventory line (both -> 1200)
      expect(sum('acc_2100', 'credit')).toBeCloseTo(225); // VAT stays one line
      expect(sum('acc_1100', 'debit')).toBeCloseTo(1725); // AR stays one line

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(2225);
    });

    it('falls back to the generic Sales Revenue / COGS accounts for an unmapped category', async () => {
      const { service, journalEntryService } = setup([], { prod_x: 30 }, {
        categoryByProduct: { prod_x: 'Gadgets' }, // not in CATEGORY_MAPPINGS
        categoryMappings: CATEGORY_MAPPINGS,
      });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-SPLIT-FALLBACK',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [
          { id: 'li_1', productId: 'prod_x', description: 'Gizmo', quantity: 4, unitPrice: 100, taxAmount: 60, lineTotal: 400 },
        ],
        subtotal: 400,
        taxTotal: 60,
        total: 460,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const posted = await service.postInvoice(draft.id);
      const entry = await journalEntryService.getEntry(posted.journalEntryId!);

      expect(entry!.lines.find((l) => l.accountId === 'acc_4000')?.credit).toBeCloseTo(400);
      expect(entry!.lines.find((l) => l.accountId === 'acc_5000')?.debit).toBeCloseTo(120);
      expect(entry!.lines.some((l) => l.accountId === 'acc_4200')).toBe(false);
    });

    it('routes a no-product line to the generic revenue account alongside a mapped product line', async () => {
      const { service, journalEntryService } = setup([], { prod_fur: 40 }, {
        categoryByProduct: { prod_fur: 'Furniture' },
        // Furniture -> 4200 here so the generic (4000) line is distinguishable.
        categoryMappings: [
          { categoryName: 'Furniture', revenueAccountId: 'acc_4200', cogsAccountId: 'acc_5300', inventoryAccountId: 'acc_1200' },
        ],
      });
      const draft = await service.createInvoice({
        invoiceNumber: 'INV-SPLIT-MIXED-SERVICE',
        customerId: 'cust_test',
        issueDate: '2026-08-21T00:00:00.000Z',
        dueDate: '2026-09-21T00:00:00.000Z',
        lineItems: [
          { id: 'li_1', productId: 'prod_fur', description: 'Desk', quantity: 10, unitPrice: 100, taxAmount: 150, lineTotal: 1000 },
          { id: 'li_2', description: 'Delivery (service, no product)', quantity: 1, unitPrice: 200, taxAmount: 30, lineTotal: 200 },
        ],
        subtotal: 1200,
        taxTotal: 180,
        total: 1380,
        amountPaid: 0,
        currency: 'ZAR',
        status: 'draft',
      });

      const posted = await service.postInvoice(draft.id);
      const entry = await journalEntryService.getEntry(posted.journalEntryId!);
      const sum = (accountId: string, side: 'debit' | 'credit') =>
        entry!.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l[side], 0);

      expect(sum('acc_4200', 'credit')).toBeCloseTo(1000); // furniture line -> mapped account
      expect(sum('acc_4000', 'credit')).toBeCloseTo(200); // no-product line -> generic account
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const invoice = allInvoices.find((inv) => inv.amountPaid < inv.total);

      if (invoice) {
        const amount = 100;
        const updated = await service.recordPayment(invoice.id, amount);

        expect(updated.amountPaid).toBe(invoice.amountPaid + amount);
        if (updated.amountPaid >= updated.total) {
          expect(updated.status).toBe('paid');
        } else if (updated.amountPaid > 0) {
          expect(updated.status).toBe('partially_paid');
        }
      }
    });
  });

  describe('getOutstandingAmount', () => {
    it('should calculate outstanding amount', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const invoice = allInvoices[0];

      const outstanding = service.getOutstandingAmount(invoice);
      expect(outstanding).toBe(invoice.total - invoice.amountPaid);
    });
  });

  describe('getCollectionPercentage', () => {
    it('should calculate collection percentage', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();
      const invoice = allInvoices[0];

      const percentage = service.getCollectionPercentage(invoice);
      expect(percentage).toBe((invoice.amountPaid / invoice.total) * 100);
    });
  });

  describe('isOverdue', () => {
    it('should check if invoice is overdue', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();

      const overdueInvoice = allInvoices.find((inv) => inv.status === 'overdue');
      if (overdueInvoice) {
        expect(service.isOverdue(overdueInvoice)).toBe(true);
      }

      const paidInvoice = allInvoices.find((inv) => inv.status === 'paid');
      if (paidInvoice) {
        expect(service.isOverdue(paidInvoice)).toBe(false);
      }
    });
  });

  describe('getInvoicesByStatus', () => {
    it('should get invoices by status', async () => {
      const { service } = setup();
      const draftInvoices = await service.getInvoicesByStatus('draft');
      expect(draftInvoices.every((inv) => inv.status === 'draft')).toBe(true);
    });
  });

  describe('getInvoicesByCustomer', () => {
    it('should get invoices by customer', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();

      if (allInvoices.length > 0) {
        const customerId = allInvoices[0].customerId;
        const customerInvoices = await service.getInvoicesByCustomer(customerId);
        expect(customerInvoices.every((inv) => inv.customerId === customerId)).toBe(true);
      }
    });
  });

  describe('searchInvoices', () => {
    it('should search invoices', async () => {
      const { service } = setup();
      const allInvoices = await service.getInvoices();

      if (allInvoices.length > 0) {
        const invoiceNumber = allInvoices[0].invoiceNumber;
        const results = await service.searchInvoices(invoiceNumber);
        expect(results.some((inv) => inv.invoiceNumber === invoiceNumber)).toBe(true);
      }
    });
  });
});
