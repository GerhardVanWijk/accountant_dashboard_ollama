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
import { reconcileAccountsReceivable, reconcileAccountsPayable, reconcileCustomerDeposits } from './subledgerReconciliation';

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

describe('reconcileCustomerDeposits', () => {
  function receipt(overrides: Partial<CustomerReceipt> = {}): CustomerReceipt {
    return {
      id: 'rec_d',
      receiptNumber: 'REC-D-0001',
      customerId: 'cust_test',
      date: '2026-08-10T00:00:00.000Z',
      method: 'eft',
      amount: 0,
      allocations: [],
      unallocatedAmount: 0,
      currency: 'ZAR',
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
      ...overrides,
    };
  }

  it('reconciles when the 2600 control balance equals Σ unallocatedAmount', async () => {
    const journalEntryService = setupJournalEntryService();
    await journalEntryService.postJournalEntry({
      date: '2026-08-10',
      source: 'customer_receipt',
      lines: [
        { accountId: 'acc_1000', debit: 1000, credit: 0 },
        { accountId: 'acc_2600', debit: 0, credit: 1000 },
      ],
    });

    const result = await reconcileCustomerDeposits(journalEntryService, setupAccountMapper(), [
      receipt({ amount: 1000, unallocatedAmount: 1000 }),
    ]);

    expect(result.controlAccountBalance).toBeCloseTo(1000, 2);
    expect(result.subledgerTotal).toBeCloseTo(1000, 2);
    expect(result.variance).toBeCloseTo(0, 2);
    expect(result.isReconciled).toBe(true);
  });

  it('flags a variance when a deposit was received but never credited to 2600', async () => {
    const journalEntryService = setupJournalEntryService(); // nothing posted to 2600
    const result = await reconcileCustomerDeposits(journalEntryService, setupAccountMapper(), [
      receipt({ amount: 500, unallocatedAmount: 500 }),
    ]);
    expect(result.controlAccountBalance).toBe(0);
    expect(result.subledgerTotal).toBeCloseTo(500, 2);
    expect(result.variance).toBeCloseTo(-500, 2);
    expect(result.isReconciled).toBe(false);
  });

  it('a later deposit allocation (DR 2600 / CR AR) keeps 2600 tied to the reduced unallocated balance', async () => {
    const journalEntryService = setupJournalEntryService();
    await journalEntryService.postJournalEntry({
      date: '2026-08-10',
      source: 'customer_receipt',
      lines: [
        { accountId: 'acc_1000', debit: 1000, credit: 0 },
        { accountId: 'acc_2600', debit: 0, credit: 1000 },
      ],
    });
    await journalEntryService.postJournalEntry({
      date: '2026-08-15',
      source: 'customer_receipt_allocation',
      lines: [
        { accountId: 'acc_2600', debit: 400, credit: 0 },
        { accountId: 'acc_1100', debit: 0, credit: 400 },
      ],
    });

    const result = await reconcileCustomerDeposits(journalEntryService, setupAccountMapper(), [
      receipt({ amount: 1000, unallocatedAmount: 600, allocations: [{ invoiceId: 'inv_x', amount: 400 }] }),
    ]);
    expect(result.controlAccountBalance).toBeCloseTo(600, 2);
    expect(result.subledgerTotal).toBeCloseTo(600, 2);
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
 * Increment 4A: AP ties to the cent, and AR now also ties to ~R0 — the one
 * money-on-account seed receipt (rcpt_00000003, R2,000) is posted with its
 * unapplied portion credited to Customer Deposits (2600), not AR, so it no
 * longer creates an AR variance. reconcileCustomerDeposits() confirms the
 * 2600 balance equals Σ unallocatedAmount (R2,000).
 */
describe('subledger reconciliation against real seed data', () => {
  it('AP and AR both tie to the GL; the on-account receipt sits in Customer Deposits', async () => {
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
    const deposits = await reconcileCustomerDeposits(journalEntryService, accountMapper, seedCustomerReceipts as CustomerReceipt[]);

    expect(ap.isReconciled).toBe(true);

    expect(ar.variance).toBeCloseTo(0, 2);
    expect(ar.isReconciled).toBe(true);
    expect(ar.bridge.unallocatedReceipts).toBeCloseTo(2000, 2); // informational only

    expect(deposits.controlAccountBalance).toBeCloseTo(2000, 2);
    expect(deposits.subledgerTotal).toBeCloseTo(2000, 2);
    expect(deposits.isReconciled).toBe(true);
  });
});
