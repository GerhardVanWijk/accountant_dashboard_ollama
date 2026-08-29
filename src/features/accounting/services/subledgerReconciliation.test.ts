import { describe, expect, it } from 'vitest';
import { JournalEntryService } from './journalEntryService';
import { AccountService } from './accountService';
import { AccountMappingService } from './accountMappingService';
import { MockJournalEntryRepository } from '../repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '../repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '../repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { seedJournalEntries } from '@/mock-data/journalEntries';
import { seedInvoices } from '@/mock-data/invoices';
import { seedBills } from '@/mock-data/bills';
import { seedCreditNotes } from '@/mock-data/creditNotes';
import { seedCustomerReceipts } from '@/mock-data/customerReceipts';
import { seedPayments } from '@/mock-data/payments';
import type { AccountingPeriod, Invoice, Bill, CreditNote, CustomerReceipt, Payment } from '@/types';
import { reconcileAccountsReceivable, reconcileAccountsPayable } from './subledgerReconciliation';

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

function setupJournalEntryService() {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  return new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
}

/** Real AccountMappingService resolving against the same seedAccounts codes the hardcoded acc_XXXX journal lines below already use. */
function setupAccountMapper() {
  return new AccountMappingService(new AccountService(new MockAccountRepository(seedAccounts), new MockJournalEntryRepository([])));
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv_test',
    invoiceNumber: 'INV-TEST-0001',
    customerId: 'cust_test',
    issueDate: '2026-08-21T00:00:00.000Z',
    dueDate: '2026-09-20T00:00:00.000Z',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'sent',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill_test',
    billNumber: 'BILL-TEST-0001',
    supplierId: 'sup_test',
    issueDate: '2026-08-21T00:00:00.000Z',
    dueDate: '2026-09-20T00:00:00.000Z',
    lineItems: [],
    subtotal: 1000,
    taxTotal: 150,
    total: 1150,
    amountPaid: 0,
    currency: 'ZAR',
    status: 'awaiting_payment',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('reconcileAccountsReceivable', () => {
  it('reports a zero variance when the AR control account exactly matches the outstanding invoice total', async () => {
    const journalEntryService = setupJournalEntryService();
    await journalEntryService.postJournalEntry({
      date: '2026-08-21',
      source: 'invoice',
      lines: [
        { accountId: 'acc_1100', debit: 1150, credit: 0 },
        { accountId: 'acc_4000', debit: 0, credit: 1000 },
        { accountId: 'acc_2100', debit: 0, credit: 150 },
      ],
    });

    const result = await reconcileAccountsReceivable(journalEntryService, setupAccountMapper(), [invoice()], [], []);

    expect(result.controlAccountBalance).toBe(1150);
    expect(result.subledgerTotal).toBe(1150);
    expect(result.agingSubledgerTotal).toBe(1150);
    expect(result.variance).toBe(0);
    expect(result.isReconciled).toBe(true);
    expect(result.bridge).toEqual({ unallocatedReceipts: 0, creditNoteImpact: 0, other: 0 });
  });

  it('flags a variance when an invoice is in the subledger but never posted to the GL', async () => {
    const journalEntryService = setupJournalEntryService();
    // No journal entry posted at all — simulates a bug where an invoice
    // was created/sent without going through postInvoice().

    const result = await reconcileAccountsReceivable(journalEntryService, setupAccountMapper(), [invoice()], [], []);

    expect(result.controlAccountBalance).toBe(0);
    expect(result.subledgerTotal).toBe(1150);
    expect(result.variance).toBe(-1150);
    expect(result.isReconciled).toBe(false);
  });

  it('excludes draft and void invoices from both the GL-consistent and aging subledger totals', async () => {
    const journalEntryService = setupJournalEntryService();

    const result = await reconcileAccountsReceivable(
      journalEntryService,
      setupAccountMapper(),
      [invoice({ id: 'inv_draft', status: 'draft' }), invoice({ id: 'inv_void', status: 'void' })],
      [],
      [],
    );

    expect(result.subledgerTotal).toBe(0);
    expect(result.agingSubledgerTotal).toBe(0);
    expect(result.isReconciled).toBe(true);
  });
});

describe('reconcileAccountsPayable', () => {
  it('reports a zero variance when the AP control account exactly matches the outstanding bill total', async () => {
    const journalEntryService = setupJournalEntryService();
    await journalEntryService.postJournalEntry({
      date: '2026-08-21',
      source: 'bill',
      lines: [
        { accountId: 'acc_5100', debit: 1000, credit: 0 },
        { accountId: 'acc_2110', debit: 150, credit: 0 },
        { accountId: 'acc_2000', debit: 0, credit: 1150 },
      ],
    });

    const result = await reconcileAccountsPayable(journalEntryService, setupAccountMapper(), [bill()], []);

    expect(result.controlAccountBalance).toBe(1150);
    expect(result.subledgerTotal).toBe(1150);
    expect(result.agingSubledgerTotal).toBe(1150);
    expect(result.variance).toBe(0);
    expect(result.isReconciled).toBe(true);
  });

  it('flags a variance when a bill is only partially reflected in the GL', async () => {
    const journalEntryService = setupJournalEntryService();
    await journalEntryService.postJournalEntry({
      date: '2026-08-21',
      source: 'bill',
      lines: [
        { accountId: 'acc_5100', debit: 500, credit: 0 },
        { accountId: 'acc_2000', debit: 0, credit: 500 },
      ],
    });

    const result = await reconcileAccountsPayable(journalEntryService, setupAccountMapper(), [bill()], []);

    expect(result.controlAccountBalance).toBe(500);
    expect(result.subledgerTotal).toBe(1150);
    expect(result.variance).toBe(-650);
    expect(result.isReconciled).toBe(false);
  });

  it('adds nonBillApAdjustments to the GL-consistent subledger (e.g. an asset bought on supplier credit)', async () => {
    const journalEntryService = setupJournalEntryService();
    await journalEntryService.postJournalEntry({
      date: '2026-08-21',
      source: 'bill',
      lines: [
        { accountId: 'acc_5100', debit: 1000, credit: 0 },
        { accountId: 'acc_2110', debit: 150, credit: 0 },
        { accountId: 'acc_2000', debit: 0, credit: 1150 },
      ],
    });
    await journalEntryService.postJournalEntry({
      date: '2026-08-22',
      source: 'fixed_asset',
      lines: [
        { accountId: 'acc_1500', debit: 50000, credit: 0 },
        { accountId: 'acc_2000', debit: 0, credit: 50000 },
      ],
    });

    const result = await reconcileAccountsPayable(journalEntryService, setupAccountMapper(), [bill()], [], 50000);

    expect(result.controlAccountBalance).toBe(51150);
    expect(result.subledgerTotal).toBe(51150);
    expect(result.agingSubledgerTotal).toBe(1150);
    expect(result.variance).toBe(0);
    expect(result.isReconciled).toBe(true);
    expect(result.bridge.other).toBeCloseTo(-50000, 2);
  });
});

/**
 * Wires the real JournalEntryService against the real seed ledger and real
 * seed Invoices/Bills/CreditNotes/Receipts/Payments, and checks each side
 * against its GL control account.
 *
 * AP ties to the cent. AR carries one fully-explained R2,000 gap: the
 * Bushveld mock seed's generateSeedPostings deliberately does NOT post
 * money-on-account receipts (unallocatedAmount > 0) to the GL — see its
 * header comment. The GL-consistent AR subledger nets every receipt in full
 * (matching a real recordReceipt()), so it sits R2,000 below the GL control
 * for exactly the one such receipt (rcpt_00000003). The aging subledger, by
 * contrast, still ties to the GL for this simple seed.
 */
describe('subledger reconciliation against real seed data', () => {
  it('AP ties to the GL; AR carries only the documented money-on-account gap', async () => {
    const journalRepository = new MockJournalEntryRepository(seedJournalEntries);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

    const accountMapper = setupAccountMapper();
    const ar = await reconcileAccountsReceivable(
      journalEntryService,
      accountMapper,
      seedInvoices as Invoice[],
      seedCreditNotes as CreditNote[],
      seedCustomerReceipts as CustomerReceipt[],
    );
    const ap = await reconcileAccountsPayable(journalEntryService, accountMapper, seedBills as Bill[], seedPayments as Payment[]);

    expect(ap.isReconciled).toBe(true);

    expect(ar.bridge.unallocatedReceipts).toBeCloseTo(2000, 2);
    expect(ar.variance).toBeCloseTo(2000, 2);
    expect(ar.agingSubledgerTotal).toBeCloseTo(ar.controlAccountBalance, 2);
  });
});
