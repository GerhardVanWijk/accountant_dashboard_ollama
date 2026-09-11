import { describe, it, expect, beforeEach } from 'vitest';
import { FixedAssetService, type CreateFixedAssetDTO } from './fixedAssetService';
import { MockFixedAssetRepository } from '../repositories/MockFixedAssetRepository';
import { MockDepreciationEntryRepository } from '../repositories/MockDepreciationEntryRepository';
import { MockEstimateRevisionRepository } from '../repositories/MockEstimateRevisionRepository';
import { DepreciationService } from './depreciationService';
import { FakeDepreciationPeriodExecutor } from './depreciationPeriodExecutor';
import { FakeEstimateRevisionExecutor } from './estimateRevisionExecutor';
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
  let depreciationRepository: MockDepreciationEntryRepository;
  let revisionRepository: MockEstimateRevisionRepository;
  let depreciationService: DepreciationService;
  let journalEntryService: JournalEntryService;
  let estimateRevisionExecutor: FakeEstimateRevisionExecutor;

  beforeEach(() => {
    repository = new MockFixedAssetRepository([]);
    depreciationRepository = new MockDepreciationEntryRepository([]);
    revisionRepository = new MockEstimateRevisionRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    estimateRevisionExecutor = new FakeEstimateRevisionExecutor({ assets: repository, revisions: revisionRepository });
    fixedAssetService = new FixedAssetService(repository, journalEntryService, accountMapper, revisionRepository, depreciationRepository, estimateRevisionExecutor);
    const periodExecutor = new FakeDepreciationPeriodExecutor({ journal: journalEntryService, assets: repository, depreciationEntries: depreciationRepository });
    depreciationService = new DepreciationService(depreciationRepository, repository, periodExecutor, periodRepository, revisionRepository);
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

  describe('reviseEstimate', () => {
    async function capitalized(overrides: Partial<CreateFixedAssetDTO> = {}) {
      const created = await fixedAssetService.createFixedAsset(
        makeAsset({ cost: 100000, residualValue: 10000, usefulLifeYears: 5, acquisitionDate: '2026-01-01', ...overrides }),
      );
      return fixedAssetService.postAcquisition(created.id, 'acc_2000');
    }

    it('persists an effective-dated revision and refreshes the current-estimate snapshot', async () => {
      const asset = await capitalized();
      const revised = await fixedAssetService.reviseEstimate(asset.id, {
        effectiveDate: '2026-07-01',
        usefulLifeYears: 8,
        residualValue: 5000,
        reason: 'Overhaul extended the life',
      });
      expect(revised.usefulLifeYears).toBe(8);
      expect(revised.residualValue).toBe(5000);
      expect(revised.cost).toBe(100000);
      expect(revised.acquisitionDate).toBe(asset.acquisitionDate);

      const revisions = await fixedAssetService.getEstimateRevisions(asset.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({
        effectiveDate: '2026-07-01',
        usefulLifeYears: 8,
        residualValue: 5000,
        previousUsefulLifeYears: 5,
        previousResidualValue: 10000,
        reason: 'Overhaul extended the life',
      });
    });

    it('rejects a revision on a draft asset (edit it directly instead)', async () => {
      const created = await fixedAssetService.createFixedAsset(makeAsset());
      await expect(fixedAssetService.reviseEstimate(created.id, { effectiveDate: '2026-08-01', usefulLifeYears: 8 })).rejects.toThrow(/capitalized asset/i);
    });

    it('rejects an effective date that is not the first of a month', async () => {
      const asset = await capitalized();
      await expect(fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-15', usefulLifeYears: 8 })).rejects.toThrow(/first day of a month/i);
    });

    it('rejects an effective date that would re-rate an already-posted period', async () => {
      const asset = await capitalized({ acquisitionDate: '2026-01-01', cost: 120000, residualValue: 0, usefulLifeYears: 5 });
      await depreciationService.runDepreciation('2026-06-30'); // Jan–Jun posted
      await expect(
        fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-06-01', usefulLifeYears: 8 }),
      ).rejects.toThrow(/already posted/i);
      // July is fine
      await expect(
        fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', usefulLifeYears: 8 }),
      ).resolves.toBeDefined();
    });

    it('rejects a residual value above the current carrying amount', async () => {
      const asset = await capitalized();
      await expect(fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', residualValue: 999999 })).rejects.toThrow(/carrying value/i);
    });

    it('rejects a revised life that leaves no remaining life on the effective date', async () => {
      const asset = await capitalized({ acquisitionDate: '2026-01-01', usefulLifeYears: 5 });
      await expect(fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', usefulLifeYears: 0.25 })).rejects.toThrow(/remaining life/i);
    });

    it('requires an annual rate when switching to reducing balance', async () => {
      const asset = await capitalized();
      await expect(
        fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', depreciationMethod: 'reducing_balance' }),
      ).rejects.toThrow(/annual rate/i);
    });

    it('reactivates a fully-depreciated asset when a lower residual opens up more base', async () => {
      const created = await fixedAssetService.createFixedAsset(makeAsset({ cost: 12000, residualValue: 2000, usefulLifeYears: 1, acquisitionDate: '2026-01-01' }));
      const asset = await fixedAssetService.postAcquisition(created.id, 'acc_2000');
      await repository.update(asset.id, { status: 'fully_depreciated', accumulatedDepreciation: 10000 });
      const revised = await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', residualValue: 500 });
      expect(revised.status).toBe('active');
    });

    it('does not rewrite posted depreciation history', async () => {
      const asset = await capitalized({ acquisitionDate: '2026-01-01', cost: 120000, residualValue: 0, usefulLifeYears: 5 });
      const before = await depreciationService.runDepreciation('2026-06-30');
      const postedAmounts = before.entries.map((e) => ({ periodEnd: e.periodEnd, amount: e.amount }));

      await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', usefulLifeYears: 9, residualValue: 40000 });

      const history = await depreciationService.getDepreciationHistory(asset.id);
      expect(history.map((e) => ({ periodEnd: e.periodEnd, amount: e.amount }))).toEqual(postedAmounts);
    });
  });

  describe('reviseEstimate + depreciation catch-up (crossing a revision)', () => {
    it('applies the OLD estimate before the effective date and the NEW estimate after — in one catch-up run', async () => {
      // Acquired 1 May, 5-year life, R0 residual, cost 120000. Nothing posted.
      const created = await fixedAssetService.createFixedAsset(
        makeAsset({ assetNumber: 'FA-XREV', acquisitionDate: '2026-05-01', cost: 120000, residualValue: 0, usefulLifeYears: 5 }),
      );
      const asset = await fixedAssetService.postAcquisition(created.id, 'acc_2000');

      // Revision effective 1 July: 7-year total life, R20 000 residual.
      await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', usefulLifeYears: 7, residualValue: 20000 });

      // One catch-up run through September.
      const result = await depreciationService.runDepreciation('2026-09-30');
      const byMonth = new Map(result.entries.map((e) => [e.periodEnd.slice(0, 7), e.amount]));
      expect([...byMonth.keys()]).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);

      // May & June: old estimate (120000 / ~1826 days * days-in-month)
      expect(byMonth.get('2026-05')! / 31).toBeCloseTo(120000 / 1826, 1);
      // July: new estimate → strictly slower per-day than the old estimate's July
      const oldJulyPerDay = 120000 / 1826;
      expect(byMonth.get('2026-07')! / 31).toBeLessThan(oldJulyPerDay);

      // Register reconciles to the GL after the mixed-estimate catch-up.
      const updated = await repository.getById(asset.id);
      expect(updated!.accumulatedDepreciation).toBeCloseTo(
        result.entries.reduce((s, e) => s + e.amount, 0),
        2,
      );
    });

    it('handles two sequential revisions across one catch-up run', async () => {
      const created = await fixedAssetService.createFixedAsset(
        makeAsset({ assetNumber: 'FA-2REV', acquisitionDate: '2026-05-01', cost: 120000, residualValue: 0, usefulLifeYears: 5 }),
      );
      const asset = await fixedAssetService.postAcquisition(created.id, 'acc_2000');
      await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', usefulLifeYears: 7, residualValue: 20000 });
      await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-11-01', usefulLifeYears: 10, residualValue: 30000 });

      const result = await depreciationService.runDepreciation('2026-12-31');
      const perDay = result.entries.map((e) => e.amount / new Date(Date.UTC(2026, Number(e.periodEnd.slice(5, 7)), 0)).getUTCDate());
      // step down at July (index 2) and again at November (index 6)
      expect(perDay[1]).toBeGreaterThan(perDay[2]);
      expect(perDay[5]).toBeGreaterThan(perDay[6]);
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
