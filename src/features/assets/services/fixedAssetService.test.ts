import { describe, it, expect, beforeEach } from 'vitest';
import { FixedAssetService, type CreateFixedAssetDTO } from './fixedAssetService';
import { MockFixedAssetRepository } from '../repositories/MockFixedAssetRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
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
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    fixedAssetService = new FixedAssetService(repository, journalEntryService, accountMapper);
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

  describe('capitalizeFromBillLine', () => {
    it('creates an already-active asset pointing at the given journal entry, no separate posting', async () => {
      const asset = await fixedAssetService.capitalizeFromBillLine({
        sourceBillId: 'bill_123',
        journalEntryId: 'je_456',
        name: 'Delivery Van',
        category: 'motor_vehicles',
        acquisitionDate: '2026-08-21',
        cost: 350000,
        residualValue: 50000,
        usefulLifeYears: 5,
        depreciationMethod: 'straight_line',
        taxWearTearRatePercent: 20,
      });

      expect(asset.status).toBe('active');
      expect(asset.journalEntryId).toBe('je_456');
      expect(asset.sourceBillId).toBe('bill_123');
      expect(asset.accumulatedDepreciation).toBe(0);
      expect(asset.glAssetAccountId).toBe('acc_1500');
      expect(asset.assetNumber).toBeTruthy();

      // No journal entry posted through the JournalEntryService by this call —
      // the Bill's own posting already covered it.
      const trialBalance = await journalEntryService.computeTrialBalance();
      expect(trialBalance.rows).toHaveLength(0);
    });

    it('assigns sequential asset numbers alongside manually-created assets', async () => {
      const manual = await fixedAssetService.createFixedAsset(makeAsset({ assetNumber: 'ignored-manual-number' }));
      const fromBill = await fixedAssetService.capitalizeFromBillLine({
        sourceBillId: 'bill_1',
        journalEntryId: 'je_1',
        name: 'Office Printer',
        category: 'office_equipment',
        acquisitionDate: '2026-08-21',
        cost: 15000,
        residualValue: 0,
        usefulLifeYears: 4,
        depreciationMethod: 'straight_line',
      });
      expect(fromBill.assetNumber).not.toBe(manual.assetNumber);
    });

    it('rejects reducing-balance with no rate, same as createFixedAsset', async () => {
      await expect(
        fixedAssetService.capitalizeFromBillLine({
          sourceBillId: 'bill_1',
          journalEntryId: 'je_1',
          name: 'Bad Asset',
          category: 'other',
          acquisitionDate: '2026-08-21',
          cost: 1000,
          residualValue: 0,
          usefulLifeYears: 5,
          depreciationMethod: 'reducing_balance',
        }),
      ).rejects.toThrow(/reducing-balance/i);
    });

    it('rejects zero cost, same as createFixedAsset', async () => {
      await expect(
        fixedAssetService.capitalizeFromBillLine({
          sourceBillId: 'bill_1',
          journalEntryId: 'je_1',
          name: 'Bad Asset',
          category: 'other',
          acquisitionDate: '2026-08-21',
          cost: 0,
          residualValue: 0,
          usefulLifeYears: 5,
          depreciationMethod: 'straight_line',
        }),
      ).rejects.toThrow(/cost/i);
    });
  });
});
