import { describe, it, expect, beforeEach } from 'vitest';
import type { AccountingPeriod, Company, FinancialYear, TaxComputation } from '@/types';
import { ProvisionalTaxService } from './provisionalTaxService';
import { IncomeTaxConfigService } from '@/features/tax/incomeTax/services/incomeTaxConfigService';
import { MockIncomeTaxConfigRepository } from '@/features/tax/incomeTax/repositories/MockIncomeTaxConfigRepository';
import { MockProvisionalTaxPeriodRepository } from '../repositories/MockProvisionalTaxPeriodRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

const INCOME_TAX_PAYABLE_ACCOUNT_ID = 'acc_2300';
const CASH_ACCOUNT_ID = 'acc_1000';

function makeOpenPeriod(): AccountingPeriod {
  return {
    id: 'period_test_2026',
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

function makeFinancialYear(overrides: Partial<FinancialYear> = {}): FinancialYear {
  return {
    id: 'fy_test',
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

function makeTaxComputation(overrides: Partial<TaxComputation> = {}): TaxComputation {
  return {
    id: 'txc_test',
    companyId: 'comp_test',
    financialYearId: 'fy_test',
    financialYearLabel: 'FY2026',
    status: 'posted',
    accountingProfit: 300000,
    isSbcEligible: false,
    adjustments: [],
    taxableIncome: 300000,
    taxConfigId: 'itc_2026_2027',
    taxConfigTaxYearLabel: '2026/2027',
    taxLiability: 81000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProvisionalTaxService', () => {
  let journalEntryService: JournalEntryService;
  let periodRepository: MockProvisionalTaxPeriodRepository;
  let incomeTaxConfigService: IncomeTaxConfigService;
  let company: Company;
  let financialYear: FinancialYear;
  let taxComputation: TaxComputation | undefined;
  let service: ProvisionalTaxService;

  beforeEach(() => {
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const accountingPeriodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, accountingPeriodRepository, auditLog);

    periodRepository = new MockProvisionalTaxPeriodRepository();
    incomeTaxConfigService = new IncomeTaxConfigService(new MockIncomeTaxConfigRepository());

    company = makeCompany();
    financialYear = makeFinancialYear();
    taxComputation = undefined;

    service = new ProvisionalTaxService(
      periodRepository,
      { getFinancialYears: async () => [financialYear] },
      { getCompanies: async () => [company] },
      incomeTaxConfigService,
      journalEntryService,
      { getComputationForFinancialYear: async () => taxComputation },
    );
  });

  describe('getOrCreatePeriod', () => {
    it('creates a period with correctly-derived due dates for every slot and returns the same record on a second call', async () => {
      const created = await service.getOrCreatePeriod(financialYear.id);

      expect(created.financialYearId).toBe(financialYear.id);
      expect(created.first.dueDate.slice(0, 10)).toBe('2026-07-01');
      expect(created.second.dueDate.slice(0, 10)).toBe('2026-12-31');
      expect(created.topUp.dueDate.slice(0, 10)).toBe('2027-06-30');
      expect(created.first.estimatedTaxableIncome).toBeUndefined();
      expect(created.first.amountPaid).toBeUndefined();

      const again = await service.getOrCreatePeriod(financialYear.id);
      expect(again.id).toBe(created.id);

      const all = await periodRepository.getAll();
      expect(all).toHaveLength(1);
    });
  });

  describe('recordEstimate', () => {
    it('computes the flat-rate estimated tax liability for a non-SBC company, reusing calculateTaxLiability()', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      const updated = await service.recordEstimate(period.id, 'first', 300000);

      // Not SBC-eligible -> flat 27% rate, same figure taxComputationService.test.ts asserts for the identical input.
      expect(updated.first.estimatedTaxableIncome).toBeCloseTo(300000, 2);
      expect(updated.first.estimatedTaxLiability).toBeCloseTo(81000, 2);
      // Other slots untouched.
      expect(updated.second.estimatedTaxLiability).toBeUndefined();
    });

    it('computes the SBC bracket-based estimated tax liability for an SBC-eligible company', async () => {
      company.isSbcEligible = true;
      const period = await service.getOrCreatePeriod(financialYear.id);
      const updated = await service.recordEstimate(period.id, 'second', 300000);

      // SBC-eligible -> uses the bracket table, must differ from the flat-rate figure.
      expect(updated.second.estimatedTaxLiability).toBeDefined();
      expect(updated.second.estimatedTaxLiability).not.toBeCloseTo(81000, 2);
    });

    it('rejects changing the estimate for a slot that has already been paid', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await service.recordEstimate(period.id, 'first', 300000);
      await service.payProvisionalTax(period.id, 'first', 40000, '2026-07-01');

      await expect(service.recordEstimate(period.id, 'first', 350000)).rejects.toThrow(/already been paid/i);
    });
  });

  describe('payProvisionalTax', () => {
    it('posts a balanced journal entry DR Income Tax Payable / CR Cash and Bank and records the payment on the slot', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await service.recordEstimate(period.id, 'first', 300000);

      const paid = await service.payProvisionalTax(period.id, 'first', 40000, '2026-07-01');

      expect(paid.first.amountPaid).toBeCloseTo(40000, 2);
      expect(paid.first.paidDate).toBe('2026-07-01');
      expect(paid.first.journalEntryId).toBeDefined();

      const entries = await journalEntryService.getEntries();
      const entry = entries.find((e) => e.id === paid.first.journalEntryId);
      expect(entry).toBeDefined();
      expect(entry?.lines).toHaveLength(2);

      const payableLine = entry?.lines.find((l) => l.accountId === INCOME_TAX_PAYABLE_ACCOUNT_ID);
      const cashLine = entry?.lines.find((l) => l.accountId === CASH_ACCOUNT_ID);
      expect(payableLine?.debit).toBeCloseTo(40000, 2);
      expect(payableLine?.credit).toBe(0);
      expect(cashLine?.credit).toBeCloseTo(40000, 2);
      expect(cashLine?.debit).toBe(0);

      const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit, 2);
    });

    it('rejects paying an already-paid slot (idempotency guard)', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await service.recordEstimate(period.id, 'first', 300000);
      await service.payProvisionalTax(period.id, 'first', 40000, '2026-07-01');

      await expect(service.payProvisionalTax(period.id, 'first', 10000, '2026-07-15')).rejects.toThrow(/already been recorded as paid/i);
    });

    it('rejects a non-positive amount', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await expect(service.payProvisionalTax(period.id, 'first', 0, '2026-07-01')).rejects.toThrow(/greater than 0/i);
    });
  });

  describe('getReconciliation', () => {
    it('returns undefined when no period exists yet for the financial year', async () => {
      const result = await service.getReconciliation(financialYear.id);
      expect(result).toBeUndefined();
    });

    it('reports totalPaid with no finalTaxLiability/variance until a posted TaxComputation exists', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await service.recordEstimate(period.id, 'first', 300000);
      await service.payProvisionalTax(period.id, 'first', 40000, '2026-07-01');

      const result = await service.getReconciliation(financialYear.id);
      expect(result?.totalPaid).toBeCloseTo(40000, 2);
      expect(result?.finalTaxLiability).toBeUndefined();
      expect(result?.variance).toBeUndefined();
    });

    it('diffs total paid against the final posted TaxComputation once one exists — a shortfall shows as a positive variance still owed', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await service.recordEstimate(period.id, 'first', 300000);
      await service.payProvisionalTax(period.id, 'first', 40000, '2026-07-01');
      await service.recordEstimate(period.id, 'second', 300000);
      await service.payProvisionalTax(period.id, 'second', 30000, '2026-12-31');

      taxComputation = makeTaxComputation({ taxLiability: 81000, status: 'posted' });

      const result = await service.getReconciliation(financialYear.id);
      expect(result?.totalPaid).toBeCloseTo(70000, 2);
      expect(result?.finalTaxLiability).toBeCloseTo(81000, 2);
      expect(result?.variance).toBeCloseTo(11000, 2); // still owed
    });

    it('shows a negative variance (overpayment/refund) when total paid exceeds the final liability', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await service.recordEstimate(period.id, 'first', 300000);
      await service.payProvisionalTax(period.id, 'first', 90000, '2026-07-01');

      taxComputation = makeTaxComputation({ taxLiability: 81000, status: 'posted' });

      const result = await service.getReconciliation(financialYear.id);
      expect(result?.variance).toBeCloseTo(-9000, 2);
    });

    it('ignores a draft (not yet posted) TaxComputation for the reconciliation', async () => {
      const period = await service.getOrCreatePeriod(financialYear.id);
      await service.recordEstimate(period.id, 'first', 300000);
      await service.payProvisionalTax(period.id, 'first', 40000, '2026-07-01');

      taxComputation = makeTaxComputation({ status: 'draft' });

      const result = await service.getReconciliation(financialYear.id);
      expect(result?.finalTaxLiability).toBeUndefined();
      expect(result?.variance).toBeUndefined();
    });
  });
});
