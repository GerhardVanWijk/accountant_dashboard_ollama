import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileAssetRegisterToGl } from './assetRegisterReconciliationService';
import { DepreciationService } from './depreciationService';
import { FixedAssetService } from './fixedAssetService';
import { FakeDepreciationPeriodExecutor } from './depreciationPeriodExecutor';
import { FakeEstimateRevisionExecutor } from './estimateRevisionExecutor';
import { MockFixedAssetRepository } from '../repositories/MockFixedAssetRepository';
import { MockDepreciationEntryRepository } from '../repositories/MockDepreciationEntryRepository';
import { MockEstimateRevisionRepository } from '../repositories/MockEstimateRevisionRepository';
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
    id: 'p', companyId: 'c', financialYearId: 'fy', name: '2026',
    startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T23:59:59.999Z', status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('reconcileAssetRegisterToGl', () => {
  let fixedAssetService: FixedAssetService;
  let fixedAssetRepository: MockFixedAssetRepository;
  let depreciationService: DepreciationService;
  let journalEntryService: JournalEntryService;

  async function activeAsset(cost: number) {
    const created = await fixedAssetService.createFixedAsset({
      assetNumber: `FA-${cost}`, name: 'Asset', category: 'plant_and_machinery',
      acquisitionDate: '2026-01-01', cost, residualValue: 0, usefulLifeYears: 5,
      depreciationMethod: 'straight_line',
      glAssetAccountId: 'acc_1500', glAccumulatedDepreciationAccountId: 'acc_1590', glDepreciationExpenseAccountId: 'acc_5200',
    });
    return fixedAssetService.postAcquisition(created.id, 'acc_2000');
  }

  beforeEach(() => {
    fixedAssetRepository = new MockFixedAssetRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, new AuditLogService(new MockAuditLogRepository()));
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    const depreciationRepository = new MockDepreciationEntryRepository([]);
    const revisionRepository = new MockEstimateRevisionRepository([]);
    const estimateRevisionExecutor = new FakeEstimateRevisionExecutor({ assets: fixedAssetRepository, revisions: revisionRepository });
    fixedAssetService = new FixedAssetService(fixedAssetRepository, journalEntryService, accountMapper, revisionRepository, depreciationRepository, estimateRevisionExecutor);
    const periodExecutor = new FakeDepreciationPeriodExecutor({ journal: journalEntryService, assets: fixedAssetRepository, depreciationEntries: depreciationRepository });
    depreciationService = new DepreciationService(depreciationRepository, fixedAssetRepository, periodExecutor, periodRepository, revisionRepository);
  });

  it('reconciles cost and accumulated depreciation to the GL after real postings', async () => {
    await activeAsset(100000);
    await activeAsset(50000);
    await depreciationService.runDepreciation('2026-01-31');

    const assets = await fixedAssetRepository.getAll();
    const recon = await reconcileAssetRegisterToGl(journalEntryService, assets, seedAccounts);

    expect(recon.isReconciled).toBe(true);
    expect(recon.totals.registerCost).toBeCloseTo(150000, 2);
    expect(recon.totals.glCost).toBeCloseTo(150000, 2);
    expect(recon.totals.costVariance).toBeCloseTo(0, 2);
    expect(recon.totals.accumulatedDepreciationVariance).toBeCloseTo(0, 2);
    expect(recon.totals.carryingValueVariance).toBeCloseTo(0, 2);
  });

  it('stays reconciled after a multi-month catch-up run', async () => {
    await activeAsset(120000); // acq 2026-01-01, 5yr SL
    await activeAsset(60000);
    await depreciationService.runDepreciation('2026-06-30'); // 6 monthly journals per asset

    const recon = await reconcileAssetRegisterToGl(journalEntryService, await fixedAssetRepository.getAll(), seedAccounts);
    expect(recon.isReconciled).toBe(true);
    expect(recon.totals.costVariance).toBeCloseTo(0, 2);
    expect(recon.totals.accumulatedDepreciationVariance).toBeCloseTo(0, 2);
    expect(recon.totals.carryingValueVariance).toBeCloseTo(0, 2);
  });

  it('stays reconciled after a catch-up run that crosses an estimate revision', async () => {
    const asset = await activeAsset(120000); // acq 2026-01-01, 5yr SL, R0
    await depreciationService.runDepreciation('2026-06-30');
    await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-07-01', usefulLifeYears: 9, residualValue: 20000 });
    await depreciationService.runDepreciation('2026-12-31'); // Jul–Dec on the revised estimate

    const recon = await reconcileAssetRegisterToGl(journalEntryService, await fixedAssetRepository.getAll(), seedAccounts);
    expect(recon.isReconciled).toBe(true);
    expect(recon.totals.accumulatedDepreciationVariance).toBeCloseTo(0, 2);
    expect(recon.totals.carryingValueVariance).toBeCloseTo(0, 2);
  });

  it('excludes draft assets (not in the GL yet)', async () => {
    await activeAsset(100000);
    await fixedAssetService.createFixedAsset({
      assetNumber: 'FA-DRAFT', name: 'Draft', category: 'other', acquisitionDate: '2026-01-01',
      cost: 999999, residualValue: 0, usefulLifeYears: 5, depreciationMethod: 'straight_line',
      glAssetAccountId: 'acc_1500', glAccumulatedDepreciationAccountId: 'acc_1590', glDepreciationExpenseAccountId: 'acc_5200',
    });
    const recon = await reconcileAssetRegisterToGl(journalEntryService, await fixedAssetRepository.getAll(), seedAccounts);
    expect(recon.totals.registerCost).toBeCloseTo(100000, 2);
    expect(recon.isReconciled).toBe(true);
  });

  it('flags a variance when the register is tampered with out of band', async () => {
    const asset = await activeAsset(100000);
    await fixedAssetRepository.update(asset.id, { cost: 120000 }); // direct write, no journal
    const recon = await reconcileAssetRegisterToGl(journalEntryService, await fixedAssetRepository.getAll(), seedAccounts);
    expect(recon.isReconciled).toBe(false);
    expect(recon.totals.costVariance).toBeCloseTo(20000, 2);
    expect(recon.cost[0].status).toBe('review');
  });
});
