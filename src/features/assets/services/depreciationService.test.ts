import { describe, it, expect, beforeEach } from 'vitest';
import { DepreciationService, calculateMonthlyDepreciation } from './depreciationService';
import { FixedAssetService } from './fixedAssetService';
import { MockFixedAssetRepository } from '../repositories/MockFixedAssetRepository';
import { MockDepreciationEntryRepository } from '../repositories/MockDepreciationEntryRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod, FixedAsset } from '@/types';

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

describe('calculateMonthlyDepreciation', () => {
  it('straight-line: spreads (cost - residual) evenly over usefulLifeYears * 12', () => {
    const asset = {
      assetNumber: 'FA-1',
      cost: 120000,
      residualValue: 12000,
      usefulLifeYears: 3,
      depreciationMethod: 'straight_line' as const,
      accumulatedDepreciation: 0,
    };
    // (120000 - 12000) / 3 / 12 = 3000
    expect(calculateMonthlyDepreciation(asset)).toBeCloseTo(3000, 2);
  });

  it('reducing-balance: applies the annual rate to carrying value, divided by 12', () => {
    const asset = {
      assetNumber: 'FA-2',
      cost: 62000,
      residualValue: 5000,
      usefulLifeYears: 6,
      depreciationMethod: 'reducing_balance' as const,
      reducingBalanceRatePercent: 16.67,
      accumulatedDepreciation: 20000,
    };
    const carryingValue = 62000 - 20000;
    const expected = (carryingValue * 16.67) / 100 / 12;
    expect(calculateMonthlyDepreciation(asset)).toBeCloseTo(expected, 2);
  });

  it('throws for reducing-balance with no rate set', () => {
    const asset = {
      assetNumber: 'FA-3',
      cost: 10000,
      residualValue: 0,
      usefulLifeYears: 5,
      depreciationMethod: 'reducing_balance' as const,
      accumulatedDepreciation: 0,
    };
    expect(() => calculateMonthlyDepreciation(asset)).toThrow(/reducingBalanceRatePercent/);
  });

  it('caps the charge so accumulated depreciation never exceeds the depreciable base', () => {
    const asset = {
      assetNumber: 'FA-4',
      cost: 10000,
      residualValue: 1000,
      usefulLifeYears: 5,
      depreciationMethod: 'straight_line' as const,
      accumulatedDepreciation: 8950, // only 50 left of the 9000 depreciable base
    };
    expect(calculateMonthlyDepreciation(asset)).toBeCloseTo(50, 2);
  });

  it('returns 0 once fully depreciated', () => {
    const asset = {
      assetNumber: 'FA-5',
      cost: 10000,
      residualValue: 1000,
      usefulLifeYears: 5,
      depreciationMethod: 'straight_line' as const,
      accumulatedDepreciation: 9000,
    };
    expect(calculateMonthlyDepreciation(asset)).toBe(0);
  });
});

describe('DepreciationService.runDepreciation', () => {
  let fixedAssetService: FixedAssetService;
  let fixedAssetRepository: MockFixedAssetRepository;
  let depreciationRepository: MockDepreciationEntryRepository;
  let depreciationService: DepreciationService;
  let journalEntryService: JournalEntryService;

  async function activeAsset(overrides: Partial<FixedAsset> = {}): Promise<FixedAsset> {
    const created = await fixedAssetService.createFixedAsset({
      assetNumber: overrides.assetNumber ?? 'FA-A',
      name: overrides.name ?? 'Test Asset',
      category: 'plant_and_machinery',
      acquisitionDate: '2026-01-01',
      cost: overrides.cost ?? 12000,
      residualValue: overrides.residualValue ?? 0,
      usefulLifeYears: overrides.usefulLifeYears ?? 1,
      depreciationMethod: overrides.depreciationMethod ?? 'straight_line',
      reducingBalanceRatePercent: overrides.reducingBalanceRatePercent,
      glAssetAccountId: 'acc_1500',
      glAccumulatedDepreciationAccountId: 'acc_1590',
      glDepreciationExpenseAccountId: 'acc_5200',
    });
    return fixedAssetService.postAcquisition(created.id, 'acc_2000');
  }

  beforeEach(() => {
    fixedAssetRepository = new MockFixedAssetRepository([]);
    depreciationRepository = new MockDepreciationEntryRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    fixedAssetService = new FixedAssetService(fixedAssetRepository, journalEntryService, accountMapper);
    depreciationService = new DepreciationService(depreciationRepository, fixedAssetRepository, journalEntryService);
  });

  it('posts a balanced combined journal entry across multiple assets', async () => {
    await activeAsset({ assetNumber: 'FA-A', cost: 12000, usefulLifeYears: 1 }); // 1000/month
    await activeAsset({ assetNumber: 'FA-B', cost: 24000, usefulLifeYears: 2 }); // 1000/month

    const result = await depreciationService.runDepreciation('2026-01-31');
    expect(result.entries).toHaveLength(2);
    expect(result.journalEntryId).toBeDefined();

    const entry = await journalEntryService.getEntry(result.journalEntryId!);
    expect(entry!.lines).toHaveLength(4);
    const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
    expect(totalDebit).toBeCloseTo(2000, 2);

    const trialBalance = await journalEntryService.computeTrialBalance();
    expect(trialBalance.balanced).toBe(true);
  });

  it('updates each asset\'s accumulatedDepreciation and records a ledger row', async () => {
    const asset = await activeAsset({ assetNumber: 'FA-C', cost: 12000, usefulLifeYears: 1 });
    await depreciationService.runDepreciation('2026-01-31');

    const updated = await fixedAssetRepository.getById(asset.id);
    expect(updated!.accumulatedDepreciation).toBeCloseTo(1000, 2);

    const history = await depreciationService.getDepreciationHistory(asset.id);
    expect(history).toHaveLength(1);
    expect(history[0].carryingValueAfter).toBeCloseTo(11000, 2);
  });

  it('is idempotent for the same period end — a second run finds nothing eligible', async () => {
    await activeAsset({ assetNumber: 'FA-D', cost: 12000, usefulLifeYears: 1 });
    const first = await depreciationService.runDepreciation('2026-01-31');
    expect(first.entries).toHaveLength(1);

    const second = await depreciationService.runDepreciation('2026-01-31');
    expect(second.entries).toHaveLength(0);
    expect(second.journalEntryId).toBeUndefined();
  });

  it('flips status to fully_depreciated once the depreciable base is exhausted', async () => {
    const asset = await activeAsset({ assetNumber: 'FA-E', cost: 1000, residualValue: 0, usefulLifeYears: 1 }); // 12 months of ~83.33
    for (let month = 1; month <= 12; month++) {
      await depreciationService.runDepreciation(`2026-${String(month).padStart(2, '0')}-28`);
    }
    const final = await fixedAssetRepository.getById(asset.id);
    expect(final!.status).toBe('fully_depreciated');
    expect(final!.accumulatedDepreciation).toBeCloseTo(1000, 2);
  });

  it('excludes draft assets from a run', async () => {
    await fixedAssetService.createFixedAsset({
      assetNumber: 'FA-F',
      name: 'Never Posted',
      category: 'other',
      acquisitionDate: '2026-01-01',
      cost: 5000,
      residualValue: 0,
      usefulLifeYears: 1,
      depreciationMethod: 'straight_line',
      glAssetAccountId: 'acc_1500',
      glAccumulatedDepreciationAccountId: 'acc_1590',
      glDepreciationExpenseAccountId: 'acc_5200',
    });
    const result = await depreciationService.runDepreciation('2026-01-31');
    expect(result.entries).toHaveLength(0);
  });
});
