import { describe, expect, it } from 'vitest';
import type { Account, Company, Employee, FinancialYear, JournalEntry } from '@/types';
import { PublicInterestScoreService } from './publicInterestScoreService';
import { MockPublicInterestScoreRepository } from '../repositories/MockPublicInterestScoreRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';

const accounts: Account[] = [
  { id: 'acc_1000', code: '1000', name: 'Cash and Bank', type: 'asset', normalBalance: 'debit', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc_2000', code: '2000', name: 'Accounts Payable', type: 'liability', normalBalance: 'credit', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc_4000', code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];

const entries: JournalEntry[] = [
  {
    id: 'je1',
    entryNumber: 'JE-0001',
    date: '2026-03-01',
    status: 'posted',
    source: 'manual',
    currency: 'ZAR',
    lines: [
      { id: 'l1', accountId: 'acc_1000', debit: 2_300_000, credit: 0 },
      { id: 'l2', accountId: 'acc_4000', debit: 0, credit: 2_300_000 },
    ],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'je2',
    entryNumber: 'JE-0002',
    date: '2026-06-01',
    status: 'posted',
    source: 'manual',
    currency: 'ZAR',
    lines: [
      { id: 'l3', accountId: 'acc_1000', debit: 0, credit: 1_500_000 },
      { id: 'l4', accountId: 'acc_2000', debit: 0, credit: 1_500_000 },
    ],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

const employees: Employee[] = [
  {
    id: 'e1',
    employeeNumber: 'EMP-0001',
    firstName: 'A',
    lastName: 'One',
    employmentType: 'permanent',
    payFrequency: 'monthly',
    status: 'active',
    startDate: '2020-01-01',
    basicSalary: 20000,
    standardAllowances: [],
    standardDeductions: [],
    uifExempt: false,
    currency: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'e2',
    employeeNumber: 'EMP-0002',
    firstName: 'B',
    lastName: 'Two',
    employmentType: 'permanent',
    payFrequency: 'monthly',
    status: 'active',
    startDate: '2020-01-01',
    basicSalary: 20000,
    standardAllowances: [],
    standardDeductions: [],
    uifExempt: false,
    currency: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const financialYear: FinancialYear = {
  id: 'fy_2026',
  companyId: 'comp_001',
  name: 'FY2026',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-12-31T23:59:59.999Z',
  status: 'open',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'comp_001',
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

function makeService(company: Company) {
  return new PublicInterestScoreService(
    new MockPublicInterestScoreRepository(),
    { getAccounts: async () => accounts, getEntries: async () => entries },
    { getEmployees: async () => employees },
    { getFinancialYears: async () => [financialYear] },
    { getCompanies: async () => [company] },
    new AuditLogService(new MockAuditLogRepository()),
  );
}

describe('PublicInterestScoreService.calculateScore', () => {
  it('computes real turnover/liabilities/employee points from posted data and a manual shareholder count', async () => {
    const service = makeService(makeCompany());

    const score = await service.calculateScore({
      companyId: 'comp_001',
      financialYearId: 'fy_2026',
      shareholdersOrMembersCount: 5,
      holdsFiduciaryAssetsOverThreshold: false,
      calculatedBy: 'user_1',
    });

    expect(score.components.turnover).toBe(2_300_000);
    expect(score.components.thirdPartyLiabilities).toBe(1_500_000);
    expect(score.components.averageEmployees).toBe(2);
    expect(score.employeePoints).toBe(2);
    expect(score.turnoverPoints).toBe(3); // ceil(2.3)
    expect(score.thirdPartyLiabilityPoints).toBe(2); // ceil(1.5)
    expect(score.shareholderPoints).toBe(5);
    expect(score.totalScore).toBe(12);
    // Score < 100, not public/state-owned, no fiduciary flag, compilation unrecorded -> independent review + flagged framework.
    expect(score.suggestedAssuranceLevel).toBe('independent_review_required');
    expect(score.suggestedReportingFramework).toBe('other_sa_framework');
    expect(score.reportingFrameworkConfidence).toBe('requires_professional_review');
    expect(score.frameworkDiffersFromCurrent).toBe(true); // company is 'not_yet_determined'
  });

  it('forces an audit suggestion for a listed public company regardless of score', async () => {
    const service = makeService(makeCompany({ isPublicCompany: true, isListed: true }));

    const score = await service.calculateScore({
      companyId: 'comp_001',
      financialYearId: 'fy_2026',
      shareholdersOrMembersCount: 5,
      holdsFiduciaryAssetsOverThreshold: false,
      calculatedBy: 'user_1',
    });

    expect(score.suggestedAssuranceLevel).toBe('audit_required');
    expect(score.suggestedReportingFramework).toBe('full_ifrs');
  });

  it('rejects a negative shareholder count', async () => {
    const service = makeService(makeCompany());
    await expect(
      service.calculateScore({
        companyId: 'comp_001',
        financialYearId: 'fy_2026',
        shareholdersOrMembersCount: -1,
        holdsFiduciaryAssetsOverThreshold: false,
        calculatedBy: 'user_1',
      }),
    ).rejects.toThrow(/non-negative/);
  });
});

describe('PublicInterestScoreService history', () => {
  it('retains every calculation (append-only) and returns the newest first', async () => {
    const service = makeService(makeCompany());
    const input = {
      companyId: 'comp_001',
      financialYearId: 'fy_2026',
      shareholdersOrMembersCount: 1,
      holdsFiduciaryAssetsOverThreshold: false,
      calculatedBy: 'user_1',
    };

    const first = await service.calculateScore(input);
    const second = await service.calculateScore({ ...input, shareholdersOrMembersCount: 2 });

    const history = await service.getScoreHistory('comp_001');
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe(second.id);
    expect(history[1].id).toBe(first.id);

    const latest = await service.getLatestScore('comp_001');
    expect(latest?.id).toBe(second.id);
  });
});
