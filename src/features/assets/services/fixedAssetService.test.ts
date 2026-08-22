import { describe, it, expect, beforeEach } from 'vitest';
import { FixedAssetService, type CreateFixedAssetDTO } from './fixedAssetService';
import { MockFixedAssetRepository } from '../repositories/MockFixedAssetRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod } from '@/types';

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

function makeAsset(overrides: Partial<CreateFixedAssetDTO> = {}): CreateFixedAssetDTO {
  return {
    assetNumber: 'FA-TEST-1',
    name: 'Test Forklift',
    category: 'plant_and_machinery',
    acquisitionDate: '2026-06-01',
    cost: 100000,
    residualValue: 10000,
    usefulLifeYears: 5,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500',
    glAccumulatedDepreciationAccountId: 'acc_1590',
    glDepreciationExpenseAccountId: 'acc_5200',
    ...overrides,
  };
}

describe('FixedAssetService', () => {
  let fixedAssetService: FixedAssetService;
  let repository: MockFixedAssetRepository;
  let journalEntryService: JournalEntryService;

  beforeEach(() => {
    repository = new MockFixedAssetRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    fixedAssetService = new FixedAssetService(repository, journalEntryService);
  });

  describe('createFixedAsset', () => {
    it('creates a draft asset with zero accumulated depreciation', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      expect(asset.status).toBe('draft');
      expect(asset.accumulatedDepreciation).toBe(0);
      expect(asset.journalEntryId).toBeUndefined();
    });

    it('rejects zero or negative cost', async () => {
      await expect(fixedAssetService.createFixedAsset(makeAsset({ cost: 0 }))).rejects.toThrow(/cost/i);
    });

    it('rejects a residual value greater than cost', async () => {
      await expect(fixedAssetService.createFixedAsset(makeAsset({ residualValue: 200000 }))).rejects.toThrow(/residual/i);
    });

    it('rejects reducing-balance without a rate', async () => {
      await expect(
        fixedAssetService.createFixedAsset(makeAsset({ depreciationMethod: 'reducing_balance', reducingBalanceRatePercent: undefined })),
      ).rejects.toThrow(/reducing-balance/i);
    });
  });

  describe('postAcquisition', () => {
    it('posts a balanced DR Fixed Asset / CR contra-account entry and activates the asset', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      const activated = await fixedAssetService.postAcquisition(asset.id, 'acc_2000');

      expect(activated.status).toBe('active');
      expect(activated.journalEntryId).toBeDefined();

      const entry = await journalEntryService.getEntry(activated.journalEntryId!);
      expect(entry).toBeDefined();
      expect(entry!.lines).toHaveLength(2);
      const assetLine = entry!.lines.find((l) => l.accountId === 'acc_1500');
      const contraLine = entry!.lines.find((l) => l.accountId === 'acc_2000');
      expect(assetLine!.debit).toBe(100000);
      expect(contraLine!.credit).toBe(100000);

      const trialBalance = await journalEntryService.computeTrialBalance();
      expect(trialBalance.balanced).toBe(true);
    });

    it('rejects posting an already-capitalized asset a second time', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      await fixedAssetService.postAcquisition(asset.id, 'acc_2000');
      await expect(fixedAssetService.postAcquisition(asset.id, 'acc_2000')).rejects.toThrow(/already been capitalized/i);
    });
  });

  describe('updateFixedAsset', () => {
    it('allows editing accounting fields while still draft', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      const updated = await fixedAssetService.updateFixedAsset(asset.id, { cost: 120000 });
      expect(updated.cost).toBe(120000);
    });

    it('locks cost/method/useful-life once capitalized', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      await fixedAssetService.postAcquisition(asset.id, 'acc_2000');
      await expect(fixedAssetService.updateFixedAsset(asset.id, { cost: 999 })).rejects.toThrow(/already been capitalized/i);
    });

    it('still allows editing name/description/tax fields once capitalized', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      await fixedAssetService.postAcquisition(asset.id, 'acc_2000');
      const updated = await fixedAssetService.updateFixedAsset(asset.id, { name: 'Renamed Forklift' });
      expect(updated.name).toBe('Renamed Forklift');
    });
  });

  describe('deleteFixedAsset', () => {
    it('deletes a draft asset', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      await fixedAssetService.deleteFixedAsset(asset.id);
      expect(await fixedAssetService.getFixedAsset(asset.id)).toBeUndefined();
    });

    it('rejects deleting a capitalized asset', async () => {
      const asset = await fixedAssetService.createFixedAsset(makeAsset());
      await fixedAssetService.postAcquisition(asset.id, 'acc_2000');
      await expect(fixedAssetService.deleteFixedAsset(asset.id)).rejects.toThrow(/only a draft/i);
    });
  });
});
