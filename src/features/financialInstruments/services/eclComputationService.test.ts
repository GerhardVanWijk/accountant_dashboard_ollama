import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountingPeriod, Company, FinancialYear } from '@/types';
import type { AgingReportRow } from '@/features/reports/aging/types';
import { EclComputationService } from './eclComputationService';
import { MockEclComputationRepository } from '../repositories/MockEclComputationRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

const ALLOWANCE_ACCOUNT_ID = 'acc_1150';
const IMPAIRMENT_EXPENSE_ACCOUNT_ID = 'acc_5700';

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'comp_test',
    name: 'Test Co (Pty) Ltd',
    legalEntityType: 'private_company',
    isPublicCompany: false,
    isListed: false,
    hasPublicAccountability: false,
    reportingFramework: 'not_yet_determined',
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    accountingBasis: 'accrual',
    functionalCurrency: 'ZAR',
    presentationCurrency: 'ZAR',
    isVatRegistered: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFinancialYear(overrides: Partial<FinancialYear> = {}): FinancialYear {
  return {
    id: 'fy_2026',
    companyId: 'comp_test',
    name: 'FY2026',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePeriod(overrides: Partial<AccountingPeriod>): AccountingPeriod {
  return {
    id: 'period_test',
    companyId: 'comp_test',
    financialYearId: 'fy_2026',
    name: '2026 (test)',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EclComputationService', () => {
  let journalEntryService: JournalEntryService;
  let repository: MockEclComputationRepository;
  let company: Company;
  let financialYear2026: FinancialYear;
  let financialYear2027: FinancialYear;
  let agingRows: AgingReportRow[];
  let service: EclComputationService;

  beforeEach(() => {
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const accountingPeriodRepository = new MockAccountingPeriodRepository([
      makePeriod({ id: 'p2026', financialYearId: 'fy_2026', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T23:59:59.999Z' }),
      makePeriod({ id: 'p2027', financialYearId: 'fy_2027', startDate: '2027-01-01T00:00:00.000Z', endDate: '2027-12-31T23:59:59.999Z' }),
    ]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, accountingPeriodRepository, auditLog);

    repository = new MockEclComputationRepository();
    company = makeCompany();
    financialYear2026 = makeFinancialYear();
    financialYear2027 = makeFinancialYear({ id: 'fy_2027', name: 'FY2027', startDate: '2027-01-01T00:00:00.000Z', endDate: '2027-12-31T23:59:59.999Z' });
    agingRows = [{ id: 'cust1', name: 'Alpha Traders', buckets: { current: 5000, days30: 3000, days60: 1000, days90Plus: 500, total: 9500 } }];

    service = new EclComputationService(
      repository,
      { getFinancialYears: async () => [financialYear2026, financialYear2027] },
      { getCompanies: async () => [company] },
      { getCustomerAgingReport: async () => agingRows },
      journalEntryService,
      new AccountMappingService(new AccountService(accountRepository, journalRepository)),
    );
  });

  describe('createComputation', () => {
    it('pulls real gross receivables per bucket from the aging report at 0% default loss rates', async () => {
      const computation = await service.createComputation(financialYear2026.id);

      expect(computation.status).toBe('draft');
      expect(computation.asOfDate).toBe(financialYear2026.endDate);
      expect(computation.buckets).toHaveLength(4);
      expect(computation.totalGrossReceivable).toBe(9500);
      expect(computation.totalExpectedCreditLoss).toBe(0);
      expect(computation.buckets.every((b) => b.lossRatePercent === 0)).toBe(true);
    });

    it('rejects a second computation for the same financial year', async () => {
      await service.createComputation(financialYear2026.id);
      await expect(service.createComputation(financialYear2026.id)).rejects.toThrow(/already has/);
    });
  });

  describe('updateBuckets', () => {
    it('recomputes totals from edited loss rates and rejects editing a posted computation', async () => {
      const computation = await service.createComputation(financialYear2026.id);
      const edited = computation.buckets.map((b) => (b.bucket === 'days90Plus' ? { ...b, lossRatePercent: 50 } : b));
      const updated = await service.updateBuckets(computation.id, edited);

      expect(updated.totalExpectedCreditLoss).toBe(250); // 500 * 50%

      await service.postComputation(updated.id);
      await expect(service.updateBuckets(updated.id, [])).rejects.toThrow(/already been posted/);
    });
  });

  describe('deleteComputation', () => {
    it('deletes a draft but rejects deleting a posted computation', async () => {
      const computation = await service.createComputation(financialYear2026.id);
      await service.deleteComputation(computation.id);
      expect(await repository.getById(computation.id)).toBeUndefined();

      const posted = await service.createComputation(financialYear2026.id);
      await service.postComputation(posted.id);
      await expect(service.deleteComputation(posted.id)).rejects.toThrow(/already posted/);
    });
  });

  describe('postComputation', () => {
    it('posts the full initial provision as ONE balanced entry when there is no prior computation', async () => {
      const computation = await service.createComputation(financialYear2026.id);
      const withRate = await service.updateBuckets(
        computation.id,
        computation.buckets.map((b) => (b.bucket === 'days60' ? { ...b, lossRatePercent: 10 } : b)),
      );

      const posted = await service.postComputation(withRate.id, 'user_1');

      expect(posted.movementAmount).toBe(100); // 1000 * 10%
      expect(posted.priorTotalExpectedCreditLoss).toBeUndefined();
      expect(posted.journalEntryId).toBeDefined();

      const allowanceLedger = await journalEntryService.getAccountLedger(ALLOWANCE_ACCOUNT_ID);
      expect(allowanceLedger[allowanceLedger.length - 1].runningBalance).toBe(100);
      const expenseLedger = await journalEntryService.getAccountLedger(IMPAIRMENT_EXPENSE_ACCOUNT_ID);
      expect(expenseLedger[expenseLedger.length - 1].runningBalance).toBe(100);
    });

    it('posts only the MOVEMENT for a second computation (including a reversal), not the full balance again', async () => {
      const first = await service.createComputation(financialYear2026.id);
      const firstWithRate = await service.updateBuckets(
        first.id,
        first.buckets.map((b) => (b.bucket === 'days90Plus' ? { ...b, lossRatePercent: 100 } : b)), // 500 * 100% = 500
      );
      await service.postComputation(firstWithRate.id);

      // Year 2: the overdue balance shrank (customer paid down), same 100% rate carried forward.
      agingRows = [{ id: 'cust1', name: 'Alpha Traders', buckets: { current: 5000, days30: 3000, days60: 1000, days90Plus: 200, total: 9200 } }];
      const second = await service.createComputation(financialYear2027.id);
      expect(second.buckets.find((b) => b.bucket === 'days90Plus')?.lossRatePercent).toBe(100); // carried forward
      expect(second.totalExpectedCreditLoss).toBe(200);

      const posted = await service.postComputation(second.id);
      expect(posted.priorTotalExpectedCreditLoss).toBe(500);
      expect(posted.movementAmount).toBe(-300); // a reversal, not a fresh 200 charge

      const allowanceLedger = await journalEntryService.getAccountLedger(ALLOWANCE_ACCOUNT_ID);
      expect(allowanceLedger[allowanceLedger.length - 1].runningBalance).toBe(200);
    });

    it('posts with no journal entry when the movement is nil, but still moves to posted', async () => {
      const first = await service.createComputation(financialYear2026.id);
      await service.postComputation(first.id); // all rates 0% -> nil movement

      const second = await service.createComputation(financialYear2027.id);
      const posted = await service.postComputation(second.id);

      expect(posted.status).toBe('posted');
      expect(posted.movementAmount).toBe(0);
      expect(posted.journalEntryId).toBeUndefined();
    });

    it('rejects posting an already-posted computation', async () => {
      const computation = await service.createComputation(financialYear2026.id);
      await service.postComputation(computation.id);
      await expect(service.postComputation(computation.id)).rejects.toThrow(/already been posted/);
    });
  });
});
