import { describe, expect, it } from 'vitest';
import type { AccountingPeriod, EclComputation } from '@/types';
import { reconcileEclToGl } from './eclReconciliationService';
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

function makeHarness() {
  const journalRepository = new MockJournalEntryRepository([]);
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
  const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
  return { journalEntryService, accountMapper };
}

function makeComputation(overrides: Partial<EclComputation> = {}): Pick<EclComputation, 'asOfDate' | 'totalExpectedCreditLoss' | 'status'> {
  return {
    asOfDate: '2026-12-31T23:59:59.999Z',
    totalExpectedCreditLoss: 950,
    status: 'posted',
    ...overrides,
  };
}

describe('reconcileEclToGl', () => {
  it('rejects reconciling a draft (nothing posted) computation', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    await expect(reconcileEclToGl(journalEntryService, accountMapper, makeComputation({ status: 'draft' }))).rejects.toThrow(/only a posted computation/i);
  });

  it('reconciles cleanly to R0.00 when the GL allowance balance matches the schedule exactly', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    const [impairmentLossId, allowanceId] = await Promise.all([
      accountMapper.getAccountId('IMPAIRMENT_LOSS'),
      accountMapper.getAccountId('ALLOWANCE_FOR_DOUBTFUL_DEBTS'),
    ]);
    await journalEntryService.postJournalEntry({
      date: '2026-12-31', source: 'expected_credit_loss',
      lines: [{ accountId: impairmentLossId, debit: 950, credit: 0 }, { accountId: allowanceId, debit: 0, credit: 950 }],
    });

    const reconciliation = await reconcileEclToGl(journalEntryService, accountMapper, makeComputation());

    expect(reconciliation.allowance.isReconciled).toBe(true);
    expect(reconciliation.allowance.expectedAllowance).toBe(950);
    expect(reconciliation.allowance.glAllowance).toBeCloseTo(950, 2);
  });

  it('detects a tampered/stray journal posted directly to the Allowance for Doubtful Debts account outside the posting flow', async () => {
    const { journalEntryService, accountMapper } = makeHarness();
    const [impairmentLossId, allowanceId, cashId] = await Promise.all([
      accountMapper.getAccountId('IMPAIRMENT_LOSS'),
      accountMapper.getAccountId('ALLOWANCE_FOR_DOUBTFUL_DEBTS'),
      accountMapper.getAccountId('CASH_AND_BANK'),
    ]);
    await journalEntryService.postJournalEntry({
      date: '2026-12-31', source: 'expected_credit_loss',
      lines: [{ accountId: impairmentLossId, debit: 950, credit: 0 }, { accountId: allowanceId, debit: 0, credit: 950 }],
    });
    // A stray/manual entry with no matching schedule change.
    await journalEntryService.postJournalEntry({
      date: '2026-10-01', source: 'manual',
      lines: [{ accountId: cashId, debit: 200, credit: 0 }, { accountId: allowanceId, debit: 0, credit: 200 }],
    });

    const reconciliation = await reconcileEclToGl(journalEntryService, accountMapper, makeComputation());

    expect(reconciliation.allowance.isReconciled).toBe(false);
    expect(reconciliation.allowance.glAllowance).toBeCloseTo(1150, 2);
    expect(reconciliation.allowance.variance).toBeCloseTo(200, 2);
  });
});
