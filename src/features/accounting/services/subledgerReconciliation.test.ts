import { describe, expect, it } from 'vitest';
import { JournalEntryService } from './journalEntryService';
import { MockJournalEntryRepository } from '../repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '../repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '../repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { seedJournalEntries } from '@/mock-data/journalEntries';
import { seedInvoices } from '@/mock-data/invoices';
import { seedBills } from '@/mock-data/bills';
import type { AccountingPeriod, Invoice, Bill } from '@/types';
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

    const result = await reconcileAccountsReceivable(journalEntryService, [invoice()]);

    expect(result.controlAccountBalance).toBe(1150);
    expect(result.subledgerTotal).toBe(1150);
    expect(result.variance).toBe(0);
    expect(result.isReconciled).toBe(true);
  });

  it('flags a variance when an invoice is in the subledger but never posted to the GL', async () => {
    const journalEntryService = setupJournalEntryService();
    // No journal entry posted at all — simulates a bug where an invoice
    // was created/sent without going through postInvoice().

    const result = await reconcileAccountsReceivable(journalEntryService, [invoice()]);

    expect(result.controlAccountBalance).toBe(0);
    expect(result.subledgerTotal).toBe(1150);
    expect(result.variance).toBe(-1150);
    expect(result.isReconciled).toBe(false);
  });

  it('excludes draft and void invoices from the subledger total', async () => {
    const journalEntryService = setupJournalEntryService();

    const result = await reconcileAccountsReceivable(journalEntryService, [
      invoice({ id: 'inv_draft', status: 'draft' }),
      invoice({ id: 'inv_void', status: 'void' }),
    ]);

    expect(result.subledgerTotal).toBe(0);
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

    const result = await reconcileAccountsPayable(journalEntryService, [bill()]);

    expect(result.controlAccountBalance).toBe(1150);
    expect(result.subledgerTotal).toBe(1150);
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

    const result = await reconcileAccountsPayable(journalEntryService, [bill()]);

    expect(result.controlAccountBalance).toBe(500);
    expect(result.subledgerTotal).toBe(1150);
    expect(result.variance).toBe(-650);
    expect(result.isReconciled).toBe(false);
  });
});

/**
 * Proves generateSeedPostings.ts's receipt/payment backfill (2026-08-22)
 * actually closes the gap it was built for — not just that nothing broke.
 * Mirrors vatReportService.test.ts's "against real seed data" integration
 * test exactly: wires the real JournalEntryService against the real seed
 * ledger and real seed Invoices/Bills (whose `amountPaid` reflects real,
 * partially/fully-paid documents), and asserts both reconcile cleanly.
 */
describe('subledger reconciliation against real seed data', () => {
  it('reconciles both AR and AP cleanly — proves the receipt/payment GL backfill matches seed Invoices/Bills\' real amountPaid', async () => {
    const journalRepository = new MockJournalEntryRepository(seedJournalEntries);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

    const ar = await reconcileAccountsReceivable(journalEntryService, seedInvoices);
    const ap = await reconcileAccountsPayable(journalEntryService, seedBills);

    expect(ar.isReconciled).toBe(true);
    expect(ap.isReconciled).toBe(true);
  });
});
