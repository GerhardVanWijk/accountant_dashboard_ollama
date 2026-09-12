import { describe, expect, it } from 'vitest';
import type { AccountingPeriod, DeferredTaxComputation } from '@/types';
import { reconcileDeferredTaxToGl } from './deferredTaxReconciliationService';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

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

function makeHarness(periods: AccountingPeriod[] = [makeOpenPeriod()]) {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository(periods);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  return { journalEntryService, accountMapper };
}

function makeComputation(overrides: Partial<DeferredTaxComputation> = {}): Pick<DeferredTaxComputation, 'asOfDate' | 'totalDeferredTaxLiability' | 'totalDeferredTaxAsset' | 'status'> {
  return {
    asOfDate: '2026-12-31T23:59:59.999Z',
    totalDeferredTaxLiability: 5400,
    totalDeferredTaxAsset: 0,
    status: 'posted',
    ...overrides,
  };
}

describe('reconcileDeferredTaxToGl', () => {
  it('rejects reconciling a draft (nothing posted) computation — never falsely marks an unposted schedule reconciled', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    await expect(reconcileDeferredTaxToGl(journalEntryService, accountMapper, makeComputation({ status: 'draft' }))).rejects.toThrow(/only a posted computation/i);
  });

  it('reconciles cleanly to R0.00 when the GL balance matches the schedule exactly', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    const [dtlId, dteId] = await Promise.all([
      accountMapper.getAccountId('DEFERRED_TAX_LIABILITY'),
      accountMapper.getAccountId('DEFERRED_TAX_EXPENSE'),
    ]);
    await journalEntryService.postJournalEntry({
      date: '2026-12-31', source: 'deferred_tax',
      lines: [{ accountId: dteId, debit: 5400, credit: 0 }, { accountId: dtlId, debit: 0, credit: 5400 }],
    });

    const reconciliation = await reconcileDeferredTaxToGl(journalEntryService, accountMapper, makeComputation());

    expect(reconciliation.deferredTaxLiability.isReconciled).toBe(true);
    expect(reconciliation.deferredTaxLiability.scheduleAmount).toBe(5400);
    expect(reconciliation.deferredTaxLiability.glAmount).toBeCloseTo(5400, 2);
    expect(reconciliation.deferredTaxAsset.isReconciled).toBe(true);
  });

  it('detects a tampered/stray journal posted directly to the Deferred Tax Liability account outside the posting flow', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    const [dtlId, dteId, cashId] = await Promise.all([
      accountMapper.getAccountId('DEFERRED_TAX_LIABILITY'),
      accountMapper.getAccountId('DEFERRED_TAX_EXPENSE'),
      accountMapper.getAccountId('CASH_AND_BANK'),
    ]);
    // The genuine posting.
    await journalEntryService.postJournalEntry({
      date: '2026-12-31', source: 'deferred_tax',
      lines: [{ accountId: dteId, debit: 5400, credit: 0 }, { accountId: dtlId, debit: 0, credit: 5400 }],
    });
    // A tampered/manual entry that also touches Deferred Tax Liability, with no corresponding schedule change.
    await journalEntryService.postJournalEntry({
      date: '2026-11-15', source: 'manual',
      lines: [{ accountId: cashId, debit: 1000, credit: 0 }, { accountId: dtlId, debit: 0, credit: 1000 }],
    });

    const reconciliation = await reconcileDeferredTaxToGl(journalEntryService, accountMapper, makeComputation());

    expect(reconciliation.deferredTaxLiability.isReconciled).toBe(false);
    expect(reconciliation.deferredTaxLiability.glAmount).toBeCloseTo(6400, 2);
    expect(reconciliation.deferredTaxLiability.variance).toBeCloseTo(1000, 2);
  });

  it('excludes a GL movement dated AFTER asOfDate from the balance (point-in-time correctness)', async () => {
    const { journalEntryService, accountMapper } = makeHarness([
      makeOpenPeriod(),
      { ...makeOpenPeriod(), id: 'period_test_2027', startDate: '2027-01-01T00:00:00.000Z', endDate: '2027-12-31T23:59:59.999Z' },
    ]);
    const [dtlId, dteId] = await Promise.all([
      accountMapper.getAccountId('DEFERRED_TAX_LIABILITY'),
      accountMapper.getAccountId('DEFERRED_TAX_EXPENSE'),
    ]);
    await journalEntryService.postJournalEntry({
      date: '2026-12-31', source: 'deferred_tax',
      lines: [{ accountId: dteId, debit: 5400, credit: 0 }, { accountId: dtlId, debit: 0, credit: 5400 }],
    });
    // A LATER movement (next year) must not leak into this asOfDate's balance.
    await journalEntryService.postJournalEntry({
      date: '2027-03-01', source: 'deferred_tax',
      lines: [{ accountId: dteId, debit: 2000, credit: 0 }, { accountId: dtlId, debit: 0, credit: 2000 }],
    });

    const reconciliation = await reconcileDeferredTaxToGl(journalEntryService, accountMapper, makeComputation());
    expect(reconciliation.deferredTaxLiability.glAmount).toBeCloseTo(5400, 2);
    expect(reconciliation.deferredTaxLiability.isReconciled).toBe(true);
  });
});
