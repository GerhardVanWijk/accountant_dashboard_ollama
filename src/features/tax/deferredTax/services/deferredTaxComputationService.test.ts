import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountingPeriod, Company, FinancialYear } from '@/types';
import type { TaxRegisterRow } from '@/features/assets/services/taxRegisterService';
import { DeferredTaxComputationService } from './deferredTaxComputationService';
import { MockDeferredTaxComputationRepository } from '../repositories/MockDeferredTaxComputationRepository';
import { IncomeTaxConfigService } from '@/features/tax/incomeTax/services/incomeTaxConfigService';
import { MockIncomeTaxConfigRepository } from '@/features/tax/incomeTax/repositories/MockIncomeTaxConfigRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

const DEFERRED_TAX_ASSET_ACCOUNT_ID = 'acc_1600';
const DEFERRED_TAX_LIABILITY_ACCOUNT_ID = 'acc_2400';
const DEFERRED_TAX_EXPENSE_ACCOUNT_ID = 'acc_5600';

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

function makeAssetRow(overrides: Partial<TaxRegisterRow> = {}): TaxRegisterRow {
  return {
    assetId: 'fa1',
    assetNumber: 'FA-0001',
    name: 'Delivery Van',
    category: 'motor_vehicles',
    cost: 100000,
    acquisitionDate: '2024-01-01',
    accountingCarryingValue: 70000,
    taxWearTearRatePercent: 20,
    taxWrittenDownValue: 40000,
    temporaryDifference: -30000,
    ...overrides,
  };
}

describe('DeferredTaxComputationService', () => {
  let journalEntryService: JournalEntryService;
  let incomeTaxConfigService: IncomeTaxConfigService;
  let repository: MockDeferredTaxComputationRepository;
  let company: Company;
  let financialYear2026: FinancialYear;
  let financialYear2027: FinancialYear;
  let taxRegisterRows: TaxRegisterRow[];
  let service: DeferredTaxComputationService;

  beforeEach(async () => {
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const accountingPeriodRepository = new MockAccountingPeriodRepository([
      makePeriod({ id: 'p2026', financialYearId: 'fy_2026', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T23:59:59.999Z' }),
      makePeriod({ id: 'p2027', financialYearId: 'fy_2027', startDate: '2027-01-01T00:00:00.000Z', endDate: '2027-12-31T23:59:59.999Z' }),
    ]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, accountingPeriodRepository, auditLog);

    incomeTaxConfigService = new IncomeTaxConfigService(new MockIncomeTaxConfigRepository());
    await incomeTaxConfigService.createConfig({
      taxYearLabel: '2026/2027',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: '2027-12-31T23:59:59.999Z',
      corporateTaxRatePercent: 27,
      sbcBrackets: [],
      sourceReference: 'test fixture',
    });

    repository = new MockDeferredTaxComputationRepository();
    company = makeCompany();
    financialYear2026 = makeFinancialYear();
    financialYear2027 = makeFinancialYear({ id: 'fy_2027', name: 'FY2027', startDate: '2027-01-01T00:00:00.000Z', endDate: '2027-12-31T23:59:59.999Z' });
    taxRegisterRows = [makeAssetRow()];

    service = new DeferredTaxComputationService(
      repository,
      { getFinancialYears: async () => [financialYear2026, financialYear2027] },
      { getCompanies: async () => [company] },
      { getTaxRegister: async () => taxRegisterRows },
      incomeTaxConfigService,
      journalEntryService,
      new AccountMappingService(new AccountService(accountRepository, journalRepository)),
    );
  });

  describe('createComputation', () => {
    it('auto-suggests temporary differences from the Fixed Asset Tax Register and computes totals', async () => {
      const computation = await service.createComputation(financialYear2026.id);

      expect(computation.status).toBe('draft');
      expect(computation.asOfDate).toBe(financialYear2026.endDate);
      expect(computation.items).toHaveLength(1);
      expect(computation.taxRatePercent).toBe(27);
      // 70000 carrying > 40000 tax base -> taxable, 30000 * 27% = 8100.
      expect(computation.totalDeferredTaxLiability).toBe(8100);
      expect(computation.totalDeferredTaxAsset).toBe(0);
      expect(computation.netDeferredTaxLiability).toBe(8100);
    });

    it('rejects a second computation for the same financial year', async () => {
      await service.createComputation(financialYear2026.id);
      await expect(service.createComputation(financialYear2026.id)).rejects.toThrow(/already has/);
    });
  });

  describe('updateItems', () => {
    it('recomputes totals from edited items and rejects editing a posted computation', async () => {
      const computation = await service.createComputation(financialYear2026.id);
      const updated = await service.updateItems(computation.id, [
        ...computation.items,
        {
          id: 'manual_1',
          source: 'other',
          description: 'Provision for leave pay',
          carryingAmount: 0,
          taxBase: 50000,
          temporaryDifference: -50000,
          classification: 'deductible',
          recognized: true,
          recognitionReason: 'Expect sufficient future taxable profit',
          deferredTaxAmount: 0,
        },
      ]);

      expect(updated.totalDeferredTaxAsset).toBe(13500); // 50000 * 27%
      expect(updated.totalDeferredTaxLiability).toBe(8100);
      expect(updated.netDeferredTaxLiability).toBe(8100 - 13500);

      await service.postComputation(updated.id);
      await expect(service.updateItems(updated.id, [])).rejects.toThrow(/already been posted/);
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
    it('posts the full initial recognition as ONE balanced entry when there is no prior computation', async () => {
      const computation = await service.createComputation(financialYear2026.id);
      const posted = await service.postComputation(computation.id, 'user_1');

      expect(posted.status).toBe('posted');
      expect(posted.movementAmount).toBe(8100);
      expect(posted.priorNetDeferredTaxLiability).toBeUndefined();
      expect(posted.journalEntryId).toBeDefined();

      const dtlLedger = await journalEntryService.getAccountLedger(DEFERRED_TAX_LIABILITY_ACCOUNT_ID);
      expect(dtlLedger[dtlLedger.length - 1].runningBalance).toBe(8100);
      const expenseLedger = await journalEntryService.getAccountLedger(DEFERRED_TAX_EXPENSE_ACCOUNT_ID);
      expect(expenseLedger[expenseLedger.length - 1].runningBalance).toBe(8100);
      const dtaLedger = await journalEntryService.getAccountLedger(DEFERRED_TAX_ASSET_ACCOUNT_ID);
      expect(dtaLedger).toHaveLength(0);
    });

    it('posts only the MOVEMENT for a second computation, not the full balance again', async () => {
      const first = await service.createComputation(financialYear2026.id);
      await service.postComputation(first.id);

      // Year 2 (2027): the van's temporary difference has grown (more accelerated tax wear-and-tear vs. accounting depreciation).
      taxRegisterRows = [makeAssetRow({ accountingCarryingValue: 60000, taxWrittenDownValue: 20000 })]; // temp diff now 40000 -> DTL 10800

      const second = await service.createComputation(financialYear2027.id);
      expect(second.totalDeferredTaxLiability).toBe(10800);

      const posted = await service.postComputation(second.id);
      expect(posted.priorNetDeferredTaxLiability).toBe(8100);
      expect(posted.movementAmount).toBe(10800 - 8100); // only the incremental 2700, not the full 10800

      const dtlLedger = await journalEntryService.getAccountLedger(DEFERRED_TAX_LIABILITY_ACCOUNT_ID);
      // Cumulative balance across both postings equals the second computation's own total.
      expect(dtlLedger[dtlLedger.length - 1].runningBalance).toBe(10800);
    });

    it('posts with no journal entry when the movement is nil, but still moves to posted', async () => {
      const first = await service.createComputation(financialYear2026.id);
      await service.postComputation(first.id);

      // Year 2: identical temporary difference -> zero movement.
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
