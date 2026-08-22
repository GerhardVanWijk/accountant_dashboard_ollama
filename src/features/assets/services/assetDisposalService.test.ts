import { describe, it, expect, beforeEach } from 'vitest';
import { AssetDisposalService } from './assetDisposalService';
import { DepreciationService } from './depreciationService';
import { FixedAssetService } from './fixedAssetService';
import { MockFixedAssetRepository } from '../repositories/MockFixedAssetRepository';
import { MockDepreciationEntryRepository } from '../repositories/MockDepreciationEntryRepository';
import { MockAssetDisposalRepository } from '../repositories/MockAssetDisposalRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
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

describe('AssetDisposalService.disposeAsset', () => {
  let fixedAssetService: FixedAssetService;
  let fixedAssetRepository: MockFixedAssetRepository;
  let depreciationService: DepreciationService;
  let disposalService: AssetDisposalService;
  let journalEntryService: JournalEntryService;

  async function activeAsset(cost: number, usefulLifeYears = 1, residualValue = 0): Promise<FixedAsset> {
    const created = await fixedAssetService.createFixedAsset({
      assetNumber: `FA-${cost}`,
      name: 'Test Asset',
      category: 'plant_and_machinery',
      acquisitionDate: '2026-01-01',
      cost,
      residualValue,
      usefulLifeYears,
      depreciationMethod: 'straight_line',
      glAssetAccountId: 'acc_1500',
      glAccumulatedDepreciationAccountId: 'acc_1590',
      glDepreciationExpenseAccountId: 'acc_5200',
    });
    return fixedAssetService.postAcquisition(created.id, 'acc_2000');
  }

  beforeEach(() => {
    fixedAssetRepository = new MockFixedAssetRepository([]);
    const depreciationRepository = new MockDepreciationEntryRepository([]);
    const disposalRepository = new MockAssetDisposalRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    fixedAssetService = new FixedAssetService(fixedAssetRepository, journalEntryService);
    depreciationService = new DepreciationService(depreciationRepository, fixedAssetRepository, journalEntryService);
    disposalService = new AssetDisposalService(disposalRepository, fixedAssetRepository, journalEntryService);
  });

  it('records a gain when proceeds exceed carrying value, and posts a balanced entry', async () => {
    const asset = await activeAsset(12000, 1); // 1000/month depreciation
    await depreciationService.runDepreciation('2026-01-31'); // accumulated = 1000, carrying = 11000

    const disposal = await disposalService.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 12000,
      proceedsAccountId: 'acc_1000',
    });

    expect(disposal.carryingValueAtDisposal).toBeCloseTo(11000, 2);
    expect(disposal.gainLoss).toBeCloseTo(1000, 2);

    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    const gainLine = entry!.lines.find((l) => l.accountId === 'acc_4200');
    expect(gainLine!.credit).toBeCloseTo(1000, 2);

    const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);

    const updated = await fixedAssetRepository.getById(asset.id);
    expect(updated!.status).toBe('disposed');
  });

  it('records a loss when proceeds are below carrying value', async () => {
    const asset = await activeAsset(12000, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying = 11000

    const disposal = await disposalService.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 6000,
      proceedsAccountId: 'acc_1000',
    });

    expect(disposal.gainLoss).toBeCloseTo(-5000, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    const lossLine = entry!.lines.find((l) => l.accountId === 'acc_5300');
    expect(lossLine!.debit).toBeCloseTo(5000, 2);

    const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
  });

  it('posts no gain/loss line when proceeds exactly match carrying value', async () => {
    const asset = await activeAsset(12000, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying = 11000

    const disposal = await disposalService.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 11000,
      proceedsAccountId: 'acc_1000',
    });

    expect(disposal.gainLoss).toBeCloseTo(0, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_4200')).toBeUndefined();
    expect(entry!.lines.find((l) => l.accountId === 'acc_5300')).toBeUndefined();
  });

  it('handles zero proceeds (scrapped asset) as a full loss of carrying value', async () => {
    const asset = await activeAsset(12000, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying = 11000

    const disposal = await disposalService.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 0,
      proceedsAccountId: 'acc_1000',
    });

    expect(disposal.gainLoss).toBeCloseTo(-11000, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_1000')).toBeUndefined();
    const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
  });

  it('rejects disposing a draft (never capitalized) asset', async () => {
    const created = await fixedAssetService.createFixedAsset({
      assetNumber: 'FA-DRAFT',
      name: 'Draft Asset',
      category: 'other',
      acquisitionDate: '2026-01-01',
      cost: 1000,
      residualValue: 0,
      usefulLifeYears: 1,
      depreciationMethod: 'straight_line',
      glAssetAccountId: 'acc_1500',
      glAccumulatedDepreciationAccountId: 'acc_1590',
      glDepreciationExpenseAccountId: 'acc_5200',
    });

    await expect(
      disposalService.disposeAsset({ assetId: created.id, disposalDate: '2026-02-01', proceeds: 0, proceedsAccountId: 'acc_1000' }),
    ).rejects.toThrow(/not been capitalized/i);
  });

  it('rejects disposing an already-disposed asset', async () => {
    const asset = await activeAsset(5000, 1);
    await disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-02-01', proceeds: 5000, proceedsAccountId: 'acc_1000' });

    await expect(
      disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-03-01', proceeds: 100, proceedsAccountId: 'acc_1000' }),
    ).rejects.toThrow(/already been disposed/i);
  });
});
