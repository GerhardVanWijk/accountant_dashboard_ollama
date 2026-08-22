import { describe, it, expect, beforeEach } from 'vitest';
import type { AccountingPeriod, AssetDisposal, Company, FinancialYear, FixedAsset } from '@/types';
import { TaxComputationService } from './taxComputationService';
import { IncomeTaxConfigService } from './incomeTaxConfigService';
import { MockIncomeTaxConfigRepository } from '../repositories/MockIncomeTaxConfigRepository';
import { MockTaxComputationRepository } from '../repositories/MockTaxComputationRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

const REVENUE_ACCOUNT_ID = 'acc_4000';
const EXPENSE_ACCOUNT_ID = 'acc_5000';
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

describe('TaxComputationService', () => {
  let journalEntryService: JournalEntryService;
  let taxComputationRepository: MockTaxComputationRepository;
  let incomeTaxConfigService: IncomeTaxConfigService;
  let service: TaxComputationService;
  let company: Company;
  let financialYear: FinancialYear;
  let fixedAssets: FixedAsset[];
  let disposals: AssetDisposal[];

  beforeEach(() => {
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

    taxComputationRepository = new MockTaxComputationRepository();
    incomeTaxConfigService = new IncomeTaxConfigService(new MockIncomeTaxConfigRepository());

    company = makeCompany();
    financialYear = makeFinancialYear();
    fixedAssets = [];
    disposals = [];

    service = new TaxComputationService(
      taxComputationRepository,
      journalEntryService,
      { getAccounts: async () => seedAccounts },
      { getFinancialYears: async () => [financialYear] },
      { getCompanies: async () => [company] },
      { getFixedAssets: async () => fixedAssets },
      { getDisposals: async () => disposals },
      incomeTaxConfigService,
      journalEntryService,
    );
  });

  async function postSale(amount: number, date = '2026-03-01T00:00:00.000Z') {
    await journalEntryService.postJournalEntry({
      date,
      source: 'manual',
      lines: [
        { accountId: CASH_ACCOUNT_ID, debit: amount, credit: 0 },
        { accountId: REVENUE_ACCOUNT_ID, debit: 0, credit: amount },
      ],
    });
  }

  async function postExpense(amount: number, date = '2026-04-01T00:00:00.000Z') {
    await journalEntryService.postJournalEntry({
      date,
      source: 'manual',
      lines: [
        { accountId: EXPENSE_ACCOUNT_ID, debit: amount, credit: 0 },
        { accountId: CASH_ACCOUNT_ID, debit: 0, credit: amount },
      ],
    });
  }

  it('computes accounting profit from posted GL activity and creates a draft with no adjustments when nothing else applies', async () => {
    await postSale(500000);
    await postExpense(200000);

    const computation = await service.createComputation(financialYear.id);
    expect(computation.status).toBe('draft');
    expect(computation.accountingProfit).toBeCloseTo(300000, 2);
    expect(computation.adjustments).toHaveLength(1); // just the always-present recoupment/capital-gain placeholder
    expect(computation.adjustments[0].category).toBe('recoupment_or_capital_gain');
    expect(computation.taxableIncome).toBeCloseTo(300000, 2);
    // Not SBC-eligible -> flat 27% rate.
    expect(computation.taxLiability).toBeCloseTo(81000, 2);
    expect(computation.taxConfigTaxYearLabel).toBe('2026/2027');
  });

  it('pre-fills the capital-gain adjustment from an injected CapitalGainsLookup instead of the manual zero placeholder', async () => {
    await postSale(500000);
    await postExpense(200000);

    const cgtService = new TaxComputationService(
      taxComputationRepository,
      journalEntryService,
      { getAccounts: async () => seedAccounts },
      { getFinancialYears: async () => [financialYear] },
      { getCompanies: async () => [company] },
      { getFixedAssets: async () => fixedAssets },
      { getDisposals: async () => disposals },
      incomeTaxConfigService,
      journalEntryService,
      {
        getPeriodReport: async () => ({ taxableCapitalGain: 12345, netCapitalLossForPeriod: 0 }),
      },
    );

    const computation = await cgtService.createComputation(financialYear.id);
    const cgtLine = computation.adjustments.find((a) => a.category === 'recoupment_or_capital_gain');
    expect(cgtLine?.amount).toBeCloseTo(12345, 2);
    expect(cgtLine?.direction).toBe('add');
    expect(cgtLine?.description).toMatch(/Capital Gains Tax module/);
    expect(computation.taxableIncome).toBeCloseTo(300000 + 12345, 2);
  });

  it('rejects creating a second computation for a financial year that already has one', async () => {
    await postSale(100000);
    await service.createComputation(financialYear.id);
    await expect(service.createComputation(financialYear.id)).rejects.toThrow(/already has a draft tax computation/);
  });

  it('posts a balanced journal entry (DR Income Tax Expense / CR Income Tax Payable) for a positive liability', async () => {
    await postSale(500000);
    await postExpense(200000);
    const computation = await service.createComputation(financialYear.id);

    const posted = await service.postComputation(computation.id);
    expect(posted.status).toBe('posted');
    expect(posted.journalEntryId).toBeDefined();

    const entry = await journalEntryService.getEntry(posted.journalEntryId!);
    expect(entry!.lines).toHaveLength(2);
    const expenseLine = entry!.lines.find((l) => l.accountId === 'acc_5500');
    const payableLine = entry!.lines.find((l) => l.accountId === 'acc_2300');
    expect(expenseLine!.debit).toBeCloseTo(posted.taxLiability, 2);
    expect(payableLine!.credit).toBeCloseTo(posted.taxLiability, 2);

    const trialBalance = await journalEntryService.computeTrialBalance();
    expect(trialBalance.balanced).toBe(true);
  });

  it('rejects posting the same computation twice', async () => {
    await postSale(100000);
    const computation = await service.createComputation(financialYear.id);
    await service.postComputation(computation.id);
    await expect(service.postComputation(computation.id)).rejects.toThrow(/already been posted/);
  });

  it('a loss-making year posts with status "posted" but no journal entry (nil liability)', async () => {
    await postExpense(50000);
    const computation = await service.createComputation(financialYear.id);
    expect(computation.taxableIncome).toBeLessThan(0);
    expect(computation.taxLiability).toBe(0);

    const posted = await service.postComputation(computation.id);
    expect(posted.status).toBe('posted');
    expect(posted.journalEntryId).toBeUndefined();
  });

  it('updateAdjustments recomputes taxableIncome/taxLiability and rejects editing a posted computation', async () => {
    await postSale(500000);
    await postExpense(200000);
    const computation = await service.createComputation(financialYear.id);

    const updated = await service.updateAdjustments(computation.id, [
      { id: 'a1', category: 'donations', description: 'Non-deductible donation', amount: 10000, direction: 'add' },
    ]);
    expect(updated.taxableIncome).toBeCloseTo(310000, 2);
    expect(updated.taxLiability).toBeCloseTo(310000 * 0.27, 2);

    await service.postComputation(updated.id);
    await expect(
      service.updateAdjustments(updated.id, [{ id: 'a1', category: 'other', description: 'x', amount: 1, direction: 'add' }]),
    ).rejects.toThrow(/already been posted/);
  });

  it('deleteComputation removes a draft but rejects deleting a posted one', async () => {
    await postSale(100000);
    const computation = await service.createComputation(financialYear.id);
    await service.deleteComputation(computation.id);
    expect(await service.getComputationForFinancialYear(financialYear.id)).toBeUndefined();

    await postSale(100000, '2026-05-01T00:00:00.000Z');
    const second = await service.createComputation(financialYear.id);
    await service.postComputation(second.id);
    await expect(service.deleteComputation(second.id)).rejects.toThrow(/already posted/);
  });

  it('uses the SBC bracket table instead of the flat rate when the company is flagged SBC-eligible', async () => {
    company = makeCompany({ isSbcEligible: true });
    // Re-wire the service with the updated company lookup (closures capture the `company` variable by reference via the arrow function, so no re-construction is actually needed — but be explicit for clarity).
    await postSale(465000);
    await postExpense(100000); // accountingProfit = 365000
    const computation = await service.createComputation(financialYear.id);
    expect(computation.isSbcEligible).toBe(true);
    expect(computation.taxableIncome).toBeCloseTo(365000, 2);
    expect(computation.taxLiability).toBeCloseTo(18620, 2); // exact SBC bracket boundary
  });

  it('suggests wear-and-tear allowance, depreciation add-back, and disposal add-backs as pre-filled adjustment lines', async () => {
    fixedAssets = [
      {
        id: 'fa_1',
        assetNumber: 'FA-0001',
        name: 'Delivery Van',
        category: 'motor_vehicles',
        acquisitionDate: '2026-01-01T00:00:00.000Z',
        cost: 100000,
        residualValue: 0,
        usefulLifeYears: 5,
        depreciationMethod: 'straight_line',
        glAssetAccountId: 'acc_1500',
        glAccumulatedDepreciationAccountId: 'acc_1590',
        glDepreciationExpenseAccountId: 'acc_5200',
        accumulatedDepreciation: 20000,
        status: 'active',
        taxWearTearRatePercent: 20,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    disposals = [
      {
        id: 'disp_1',
        assetId: 'fa_2',
        disposalDate: '2026-06-01T00:00:00.000Z',
        proceeds: 5000,
        carryingValueAtDisposal: 3000,
        accumulatedDepreciationAtDisposal: 7000,
        gainLoss: 2000,
        journalEntryId: 'je_x',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    await journalEntryService.postJournalEntry({
      date: '2026-02-01T00:00:00.000Z',
      source: 'depreciation',
      lines: [
        { accountId: 'acc_5200', debit: 20000, credit: 0 },
        { accountId: 'acc_1590', debit: 0, credit: 20000 },
      ],
    });
    await postSale(300000);

    const computation = await service.createComputation(financialYear.id);
    const categories = computation.adjustments.map((a) => a.category);
    expect(categories).toContain('wear_and_tear_allowance');
    expect(categories).toContain('depreciation_addback');
    expect(categories).toContain('disposal_gain_loss_addback');
    expect(categories).toContain('recoupment_or_capital_gain');

    const wt = computation.adjustments.find((a) => a.category === 'wear_and_tear_allowance')!;
    expect(wt.direction).toBe('subtract');
    expect(wt.amount).toBeCloseTo(20000, 0);

    const depr = computation.adjustments.find((a) => a.category === 'depreciation_addback')!;
    expect(depr.direction).toBe('add');
    expect(depr.amount).toBeCloseTo(20000, 2);

    const disp = computation.adjustments.find((a) => a.category === 'disposal_gain_loss_addback')!;
    expect(disp.direction).toBe('subtract'); // gain -> subtract it back out
    expect(disp.amount).toBeCloseTo(2000, 2);
  });
});
