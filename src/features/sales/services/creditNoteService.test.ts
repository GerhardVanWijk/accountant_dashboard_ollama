import { describe, it, expect } from 'vitest';
import { CreditNoteService } from './creditNoteService';
import { MockCreditNoteRepository } from '@/repositories/mock/MockCreditNoteRepository';
import { InvoiceService } from '@/services/invoiceService';
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
import type { AccountingPeriod } from '@/types';

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
 * Wires REAL JournalEntryService and InvoiceService instances (not stubs)
 * so these tests prove CreditNoteService produces a genuinely balanced
 * reversal entry, and that allocateToInvoice() genuinely updates the
 * target invoice via InvoiceService.recordPayment() — mirrors
 * src/features/banking/services/bankTransactionService.test.ts.
 */
async function setup(
  inventoryMover = fakeInventoryMover(),
  categoryMappings: CategoryAccountMappingRecord[] = [],
) {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));

  const invoiceRepository = new MockInvoiceRepository([]);
  const noOpInventoryMover = { calculateCogs: async () => 0, recordSaleMovement: async () => {} };
  const invoiceService = new InvoiceService(invoiceRepository, journalEntryService, noOpInventoryMover, accountMapper);
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
  const categoryAccounts = new CategoryAccountMappingService(new MockCategoryAccountMappingRepository(categoryMappings));
  const service = new CreditNoteService(
    creditNoteRepository,
    journalEntryService,
    invoiceService,
    inventoryMover,
    accountMapper,
    categoryAccounts,
  );

  return { service, journalEntryService, invoiceService, invoiceRepository, creditNoteRepository, invoice, inventoryMover };
}

/**
 * Fake InventoryReturnMover — records calls so tests can assert
 * recordReturnMovement is invoked with the right args, without depending on
 * the real InventoryPostingAdapter/productService.
 */
function fakeInventoryMover(costPerUnit = 40, categoryByProduct: Record<string, string> = {}) {
  const returnMovements: Array<{ productId: string; quantity: number; reference: string; warehouseId?: string }> = [];
  return {
    returnMovements,
    calculateCogs: async (_productId: string, quantity: number) => quantity * costPerUnit,
    recordReturnMovement: async (productId: string, quantity: number, reference: string, warehouseId?: string) => {
      returnMovements.push({ productId, quantity, reference, warehouseId });
    },
    getProductCategory: async (productId: string) => categoryByProduct[productId],
  };
}

describe('CreditNoteService', () => {
  describe('issueCreditNote', () => {
    it('posts a balanced reversal journal entry and transitions draft -> issued', async () => {
      const { service, journalEntryService, invoice } = await setup();

      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-1',
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
      expect(issued.status).toBe('issued');
      expect(issued.journalEntryId).toBeDefined();

      const entry = await journalEntryService.getEntry(issued.journalEntryId!);
      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
      expect(totalDebit).toBeCloseTo(345);

      const revenueLine = entry!.lines.find((l) => l.accountId === 'acc_4000');
      const vatLine = entry!.lines.find((l) => l.accountId === 'acc_2100');
      const arLine = entry!.lines.find((l) => l.accountId === 'acc_1100');
      expect(revenueLine?.debit).toBeCloseTo(300);
      expect(vatLine?.debit).toBeCloseTo(45);
      expect(arLine?.credit).toBeCloseTo(345);
    });

    it('omits the VAT line when taxTotal is zero', async () => {
      const { service, journalEntryService } = await setup();
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
      const entry = await journalEntryService.getEntry(issued.journalEntryId!);
      expect(entry!.lines.find((l) => l.accountId === 'acc_2100')).toBeUndefined();
    });

    it('reverses Cost of Sales and restores stock for a return with a tracked-inventory line item', async () => {
      const { service, journalEntryService, inventoryMover } = await setup();

      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-RETURN',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          {
            id: 'li_1',
            productId: 'prod_1',
            description: 'Widget',
            quantity: 3,
            unitPrice: 100,
            taxAmount: 45,
            lineTotal: 300,
          },
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
      const entry = await journalEntryService.getEntry(issued.journalEntryId!);

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit); // still balanced with the reversal lines added

      const inventoryLine = entry!.lines.find((l) => l.accountId === 'acc_1200');
      const cogsLine = entry!.lines.find((l) => l.accountId === 'acc_5000');
      expect(inventoryLine?.debit).toBeCloseTo(120); // 3 units * 40 cost
      expect(cogsLine?.credit).toBeCloseTo(120);

      expect(inventoryMover.returnMovements).toEqual([
        { productId: 'prod_1', quantity: 3, reference: 'Credit Note CN-2026-TEST-RETURN' },
      ]);
    });

    it("passes a line item's warehouseId through to recordReturnMovement", async () => {
      const { service, inventoryMover } = await setup();

      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-WH',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'return',
        lineItems: [
          {
            id: 'li_1',
            productId: 'prod_1',
            warehouseId: 'wh_branch',
            description: 'Widget',
            quantity: 3,
            unitPrice: 100,
            taxAmount: 45,
            lineTotal: 300,
          },
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

      expect(inventoryMover.returnMovements).toEqual([
        { productId: 'prod_1', quantity: 3, reference: 'Credit Note CN-2026-TEST-WH', warehouseId: 'wh_branch' },
      ]);
    });

    it('does not reverse Cost of Sales or restore stock for a non-return reason, even with a product line item', async () => {
      const { service, journalEntryService, inventoryMover } = await setup();

      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-PRICING',
        customerId: 'cust_test',
        issueDate: '2026-08-05T00:00:00.000Z',
        reason: 'pricing_error',
        lineItems: [
          {
            id: 'li_1',
            productId: 'prod_1',
            description: 'Widget',
            quantity: 3,
            unitPrice: 100,
            taxAmount: 45,
            lineTotal: 300,
          },
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
      const entry = await journalEntryService.getEntry(issued.journalEntryId!);

      expect(entry!.lines.find((l) => l.accountId === 'acc_1200')).toBeUndefined();
      expect(entry!.lines.find((l) => l.accountId === 'acc_5000')).toBeUndefined();
      expect(inventoryMover.returnMovements).toEqual([]);
    });

    it('splits the reversal by product category when a mapping is provided, and still balances (Phase 21.3)', async () => {
      const mover = fakeInventoryMover(40, { prod_fur: 'Furniture', prod_sta: 'Stationery' });
      const { service, journalEntryService } = await setup(mover, [
        { categoryName: 'Furniture', revenueAccountId: 'acc_4000', cogsAccountId: 'acc_5000', inventoryAccountId: 'acc_1200' },
        { categoryName: 'Stationery', revenueAccountId: 'acc_4200', cogsAccountId: 'acc_5300', inventoryAccountId: 'acc_1200' },
      ]);

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
      const entry = await journalEntryService.getEntry(issued.journalEntryId!);
      const sum = (accountId: string, side: 'debit' | 'credit') =>
        entry!.lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + l[side], 0);

      expect(sum('acc_4000', 'debit')).toBeCloseTo(200); // furniture revenue reversal
      expect(sum('acc_4200', 'debit')).toBeCloseTo(300); // stationery revenue reversal
      expect(sum('acc_5000', 'credit')).toBeCloseTo(80); // furniture COGS reversal (2 * 40)
      expect(sum('acc_5300', 'credit')).toBeCloseTo(120); // stationery COGS reversal (3 * 40)
      expect(sum('acc_1200', 'debit')).toBeCloseTo(200); // one lumped inventory restore
      expect(sum('acc_1100', 'credit')).toBeCloseTo(575); // AR stays one line
      expect(sum('acc_2100', 'debit')).toBeCloseTo(75); // VAT stays one line

      const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit);
    });

    it('uses the generic revenue/COGS accounts unchanged when no category mapping applies', async () => {
      const mover = fakeInventoryMover(40, { prod_x: 'Gadgets' });
      const { service, journalEntryService } = await setup(mover, [
        { categoryName: 'Furniture', revenueAccountId: 'acc_4200', cogsAccountId: 'acc_5300', inventoryAccountId: 'acc_1200' },
      ]);

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
      const entry = await journalEntryService.getEntry(issued.journalEntryId!);

      expect(entry!.lines.find((l) => l.accountId === 'acc_4000')?.debit).toBeCloseTo(300); // generic revenue
      expect(entry!.lines.find((l) => l.accountId === 'acc_5000')?.credit).toBeCloseTo(120); // generic COGS
      expect(entry!.lines.find((l) => l.accountId === 'acc_1200')?.debit).toBeCloseTo(120); // generic inventory
      expect(entry!.lines.some((l) => l.accountId === 'acc_4200')).toBe(false);
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
      expect(allocated.allocations).toHaveLength(1);

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

    it('rejects allocating more than the remaining credit note value', async () => {
      const { service, invoice } = await setup();
      const draft = await service.createCreditNote({
        creditNoteNumber: 'CN-2026-TEST-6',
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
      await expect(service.allocateToInvoice(issued.id, invoice.id, 200)).rejects.toThrow(/remains unallocated/i);
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
      const voided = await service.voidCreditNote(draft.id);
      expect(voided.status).toBe('void');
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
