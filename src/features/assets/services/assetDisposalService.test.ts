import { describe, it, expect, beforeEach } from 'vitest';
import { AssetDisposalService } from './assetDisposalService';
import { DepreciationService } from './depreciationService';
import { FixedAssetService } from './fixedAssetService';
import { FakeDepreciationPeriodExecutor } from './depreciationPeriodExecutor';
import { FakeDisposalExecutor } from './disposalExecutor';
import { FakeEstimateRevisionExecutor } from './estimateRevisionExecutor';
import { MockFixedAssetRepository } from '../repositories/MockFixedAssetRepository';
import { MockDepreciationEntryRepository } from '../repositories/MockDepreciationEntryRepository';
import { MockAssetDisposalRepository } from '../repositories/MockAssetDisposalRepository';
import { MockEstimateRevisionRepository } from '../repositories/MockEstimateRevisionRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { TaxRateService } from '@/features/tax/services/taxRateService';
import { MockTaxRateRepository } from '@/repositories/mock/MockTaxRateRepository';
import { MockVatSourceEntryRepository } from '@/features/tax/repositories/MockVatSourceEntryRepository';
import { VatSourceEntryService } from '@/features/tax/services/vatSourceEntryService';
import { computeVatReport, reconcileVatControlAccounts } from '@/features/tax/services/vatReportService';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { seedTaxRates } from '@/mock-data/taxRates';
import type { AccountingPeriod, FixedAsset, JournalEntry } from '@/types';

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

function balanced(entry: JournalEntry): void {
  const d = entry.lines.reduce((s, l) => s + l.debit, 0);
  const c = entry.lines.reduce((s, l) => s + l.credit, 0);
  expect(d).toBeCloseTo(c, 2);
}

describe('AssetDisposalService.disposeAsset', () => {
  let fixedAssetService: FixedAssetService;
  let fixedAssetRepository: MockFixedAssetRepository;
  let disposalRepository: MockAssetDisposalRepository;
  let revisionRepository: MockEstimateRevisionRepository;
  let depreciationService: DepreciationService;
  let disposalService: AssetDisposalService;
  let disposalServiceNoCatchUp: AssetDisposalService;
  let disposalExecutor: FakeDisposalExecutor;
  let journalEntryService: JournalEntryService;
  let accountMapper: AccountMappingService;
  let vatSourceRepository: MockVatSourceEntryRepository;
  let vatSourceService: VatSourceEntryService;

  async function activeAsset(cost: number, usefulLifeYears = 5, residualValue = 0): Promise<FixedAsset> {
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
    revisionRepository = new MockEstimateRevisionRepository([]);
    disposalRepository = new MockAssetDisposalRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    const taxRateService = new TaxRateService(new MockTaxRateRepository(seedTaxRates), auditLog);
    vatSourceRepository = new MockVatSourceEntryRepository([]);
    vatSourceService = new VatSourceEntryService(vatSourceRepository);
    const estimateRevisionExecutor = new FakeEstimateRevisionExecutor({ assets: fixedAssetRepository, revisions: revisionRepository });
    fixedAssetService = new FixedAssetService(fixedAssetRepository, journalEntryService, accountMapper, revisionRepository, depreciationRepository, estimateRevisionExecutor);
    const periodExecutor = new FakeDepreciationPeriodExecutor({ journal: journalEntryService, assets: fixedAssetRepository, depreciationEntries: depreciationRepository });
    depreciationService = new DepreciationService(depreciationRepository, fixedAssetRepository, periodExecutor, periodRepository, revisionRepository);
    disposalExecutor = new FakeDisposalExecutor({
      journal: journalEntryService,
      assets: fixedAssetRepository,
      disposals: disposalRepository,
      vatSourceEntries: vatSourceRepository,
      estimateRevisions: revisionRepository,
    });
    disposalService = new AssetDisposalService(disposalRepository, fixedAssetRepository, disposalExecutor, accountMapper, depreciationService, taxRateService);
    disposalServiceNoCatchUp = new AssetDisposalService(disposalRepository, fixedAssetRepository, disposalExecutor, accountMapper, undefined, taxRateService);
  });

  it('derecognises cost and accumulated depreciation, and records a gain', async () => {
    const asset = await activeAsset(36500, 1); // 100/day
    await depreciationService.runDepreciation('2026-01-31'); // 3100 accumulated, carrying 33400

    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 35000,
      proceedsAccountId: 'acc_1000',
    });

    expect(disposal.carryingValueAtDisposal).toBeCloseTo(33400, 2);
    expect(disposal.gainLoss).toBeCloseTo(1600, 2);

    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_1500')!.credit).toBeCloseTo(36500, 2);
    expect(entry!.lines.find((l) => l.accountId === 'acc_1590')!.debit).toBeCloseTo(3100, 2);
    expect(entry!.lines.find((l) => l.accountId === 'acc_4200')!.credit).toBeCloseTo(1600, 2);
    balanced(entry!);
    expect((await fixedAssetRepository.getById(asset.id))!.status).toBe('disposed');
  });

  it('records a loss when net proceeds are below carrying value', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying 33400

    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 20000,
      proceedsAccountId: 'acc_1000',
    });
    expect(disposal.gainLoss).toBeCloseTo(-13400, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_5300')!.debit).toBeCloseTo(13400, 2);
    balanced(entry!);
  });

  it('posts no gain/loss line when net proceeds equal carrying value', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying 33400
    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 33400,
      proceedsAccountId: 'acc_1000',
    });
    expect(disposal.gainLoss).toBeCloseTo(0, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_4200')).toBeUndefined();
    expect(entry!.lines.find((l) => l.accountId === 'acc_5300')).toBeUndefined();
  });

  it('treats a scrapped asset (zero proceeds) as a full loss of carrying value', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31');
    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 0,
      proceedsAccountId: 'acc_1000',
    });
    expect(disposal.gainLoss).toBeCloseTo(-33400, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_1000')).toBeUndefined();
    balanced(entry!);
  });

  it('splits VAT-inclusive proceeds — output VAT to the VAT control account, gain/loss on the net', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying 33400

    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 46000, // incl 15% VAT → net 40000, VAT 6000
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'inclusive',
      vatCode: 'STD',
    });

    expect(disposal.proceeds).toBeCloseTo(46000, 2); // gross cash recognised
    expect(disposal.gainLoss).toBeCloseTo(40000 - 33400, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_2100')!.credit).toBeCloseTo(6000, 2); // VAT output
    expect(entry!.lines.find((l) => l.accountId === 'acc_1000')!.debit).toBeCloseTo(46000, 2);
    balanced(entry!);
  });

  it('adds VAT on top for VAT-exclusive proceeds', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31');

    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 40000, // + 15% VAT = 46000 cash
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'exclusive',
      vatCode: 'STD',
    });
    expect(disposal.proceeds).toBeCloseTo(46000, 2);
    expect(disposal.gainLoss).toBeCloseTo(40000 - 33400, 2);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_2100')!.credit).toBeCloseTo(6000, 2);
    balanced(entry!);
  });

  it('resolves the VAT rate from the tax engine for the disposal date — no code needed, defaults to STD', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying 33400
    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 46000,
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'inclusive', // no vatCode -> STD (15% effective 2018-04-01)
    });
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_2100')!.credit).toBeCloseTo(6000, 2);
  });

  it('throws for a taxable disposal whose VAT code has no configured rate', async () => {
    const asset = await activeAsset(10000, 1);
    await expect(
      disposalServiceNoCatchUp.disposeAsset({
        assetId: asset.id,
        disposalDate: '2026-02-01',
        proceeds: 5000,
        proceedsAccountId: 'acc_1000',
        vatTreatment: 'inclusive',
        vatCode: 'NONEXISTENT',
      }),
    ).rejects.toThrow(/no VAT rate/i);
  });

  it('writes an authoritative VAT source entry for a taxable disposal (capital-goods classification)', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31');
    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 46000,
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'inclusive',
      vatCode: 'STD',
    });

    const entries = await vatSourceService.getEntriesForSource('asset_disposal', disposal.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      sourceType: 'asset_disposal',
      direction: 'output',
      treatment: 'standard_rated',
      classification: 'capital_goods',
      taxableAmount: 40000,
      vatAmount: 6000,
      grossAmount: 46000,
      transactionDate: '2026-02-01',
      journalEntryId: disposal.journalEntryId,
    });
    expect(entries[0].taxRateId).toBe('tax_std_v2');
  });

  it('writes NO VAT source entry for an out-of-scope (no VAT) disposal', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31');
    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 30000,
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'none',
    });
    expect(await vatSourceService.getEntriesForSource('asset_disposal', disposal.id)).toHaveLength(0);
    const entry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(entry!.lines.find((l) => l.accountId === 'acc_2100')).toBeUndefined();
    balanced(entry!);
  });

  it('gain/loss is on NET proceeds — output VAT never inflates the gain', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying 33400
    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 40000,
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'exclusive', // net 40000, VAT 6000, gross 46000
      vatCode: 'STD',
    });
    expect(disposal.gainLoss).toBeCloseTo(40000 - 33400, 2); // NOT 46000 - 33400
  });

  it('VAT report Output VAT and the GL VAT control reconcile to R0.00 after a taxable disposal', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31');
    await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-10',
      proceeds: 46000,
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'inclusive',
      vatCode: 'STD',
    });

    const start = new Date('2026-02-01');
    const end = new Date('2026-02-28');
    const report = computeVatReport(start, end, [], [], [], seedTaxRates, await vatSourceService.getEntries());
    expect(report.outputVat.total).toBeCloseTo(6000, 2);
    expect(report.outputVat.byTreatment.find((r) => r.treatment === 'standard_rated')?.vatAmount).toBeCloseTo(6000, 2);
    // Review 4 Item M — this disposal's capital-goods classification actually
    // reaches the report's capital-goods bucket end to end (real
    // disposeAsset() -> real VatSourceEntryService -> computeVatReport),
    // not merely a hand-built VatSourceEntry fixture.
    expect(report.outputVat.capitalGoods).toEqual({ taxBase: 40000, vatAmount: 6000 });

    const recon = await reconcileVatControlAccounts(journalEntryService, accountMapper, start, end, report);
    expect(recon.outputVat.variance).toBeCloseTo(0, 2);
    expect(recon.outputVat.isReconciled).toBe(true);
  });

  it('reverseEntry posts a contra VAT source row — evidence is never deleted', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31');
    const disposal = await disposalServiceNoCatchUp.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 46000,
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'inclusive',
      vatCode: 'STD',
    });
    const [original] = await vatSourceService.getEntriesForSource('asset_disposal', disposal.id);
    await vatSourceService.reverseEntry(original, 'Disposal reversed');

    const all = await vatSourceService.getEntriesForSource('asset_disposal', disposal.id);
    expect(all).toHaveLength(2); // original + contra, nothing deleted
    const net = all.reduce((s, e) => s + e.vatAmount, 0);
    expect(net).toBeCloseTo(0, 2);
    expect(all.find((e) => e.reversesEntryId === original.id)).toBeDefined();
  });

  it('depreciates the asset up to the disposal date before derecognition', async () => {
    const asset = await activeAsset(36500, 1); // 100/day
    // no manual depreciation run — the disposal must catch it up itself
    const disposal = await disposalService.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-02-15',
      proceeds: 30000,
      proceedsAccountId: 'acc_1000',
    });
    // 31 days Jan + 15 days Feb at 100/day = 4600 accumulated
    expect(disposal.accumulatedDepreciationAtDisposal).toBeCloseTo(4600, 2);
    expect(disposal.carryingValueAtDisposal).toBeCloseTo(31900, 2);

    const history = await depreciationService.getDepreciationHistory(asset.id);
    expect(history.map((e) => e.periodEnd)).toEqual(['2026-01-31', '2026-02-15']);
    balanced((await journalEntryService.getEntry(disposal.journalEntryId))!);
  });

  it('rejects disposing a draft or an already-disposed asset', async () => {
    const draft = await fixedAssetService.createFixedAsset({
      assetNumber: 'FA-DRAFT',
      name: 'Draft',
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
      disposalService.disposeAsset({ assetId: draft.id, disposalDate: '2026-02-01', proceeds: 0, proceedsAccountId: 'acc_1000' }),
    ).rejects.toThrow(/not been capitalized/i);

    const asset = await activeAsset(5000, 1);
    await disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-02-01', proceeds: 5000, proceedsAccountId: 'acc_1000' });
    await expect(
      disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-03-01', proceeds: 100, proceedsAccountId: 'acc_1000' }),
    ).rejects.toThrow(/already been disposed/i);
  });

  it('posts missed depreciation to its own months before the disposal journal (catch-up + disposal interaction)', async () => {
    const asset = await activeAsset(120000, 5); // straight-line, R2,000/mo-ish
    // only June is posted
    await depreciationService.catchUpToDate(asset.id, '2026-06-30');
    const beforeCount = (await depreciationService.getDepreciationHistory(asset.id)).length;

    const disposal = await disposalService.disposeAsset({
      assetId: asset.id,
      disposalDate: '2026-09-17',
      proceeds: 90000,
      proceedsAccountId: 'acc_1000',
    });

    const history = await depreciationService.getDepreciationHistory(asset.id);
    const added = history.slice(beforeCount).map((e) => e.periodEnd);
    expect(added).toEqual(['2026-07-31', '2026-08-31', '2026-09-17']); // July, Aug full; Sept prorated to disposal

    // each catch-up journal is dated in its own month, and the disposal journal on the disposal date
    for (const entry of history) {
      const je = await journalEntryService.getEntry(entry.journalEntryId);
      expect(je!.date.slice(0, 7)).toBe(entry.periodEnd.slice(0, 7));
    }
    const disposalEntry = await journalEntryService.getEntry(disposal.journalEntryId);
    expect(disposalEntry!.date.slice(0, 10)).toBe('2026-09-17');
    balanced(disposalEntry!);
  });

  it('blocks the disposal when an intermediate month is in a closed period (no stale carrying value)', async () => {
    // rebuild the stack with monthly periods, August closed
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const mm = String(m).padStart(2, '0');
      const last = new Date(Date.UTC(2026, m, 0)).getUTCDate();
      return {
        id: `p_${mm}`, companyId: 'c', financialYearId: 'fy', name: `2026-${mm}`,
        startDate: `2026-${mm}-01T00:00:00.000Z`,
        endDate: `2026-${mm}-${String(last).padStart(2, '0')}T23:59:59.999Z`,
        status: (m === 8 ? 'closed' : 'open') as 'open' | 'closed',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      };
    });
    const fixedAssetRepo = new MockFixedAssetRepository([]);
    const depRepo = new MockDepreciationEntryRepository([]);
    const revRepo = new MockEstimateRevisionRepository([]);
    const dispRepo = new MockAssetDisposalRepository([]);
    const jr = new MockJournalEntryRepository([]);
    const ar = new MockAccountRepository(seedAccounts);
    const pr = new MockAccountingPeriodRepository(monthly);
    const jes = new JournalEntryService(jr, ar, pr, new AuditLogService(new MockAuditLogRepository()));
    const mapper = new AccountMappingService(new AccountService(ar, jr));
    const revExecutor = new FakeEstimateRevisionExecutor({ assets: fixedAssetRepo, revisions: revRepo });
    const fas = new FixedAssetService(fixedAssetRepo, jes, mapper, revRepo, depRepo, revExecutor);
    const periodExecutor = new FakeDepreciationPeriodExecutor({ journal: jes, assets: fixedAssetRepo, depreciationEntries: depRepo });
    const deps = new DepreciationService(depRepo, fixedAssetRepo, periodExecutor, pr, revRepo);
    const dispExecutor = new FakeDisposalExecutor({ journal: jes, assets: fixedAssetRepo, disposals: dispRepo, estimateRevisions: revRepo });
    const disp = new AssetDisposalService(dispRepo, fixedAssetRepo, dispExecutor, mapper, deps);

    const created = await fas.createFixedAsset({
      assetNumber: 'FA-BLK', name: 'Blocked', category: 'plant_and_machinery',
      acquisitionDate: '2026-06-01', cost: 120000, residualValue: 0, usefulLifeYears: 5,
      depreciationMethod: 'straight_line',
      glAssetAccountId: 'acc_1500', glAccumulatedDepreciationAccountId: 'acc_1590', glDepreciationExpenseAccountId: 'acc_5200',
    });
    const asset = await fas.postAcquisition(created.id, 'acc_2000');
    await deps.catchUpToDate(asset.id, '2026-07-31'); // June + July posted, August still closed

    await expect(
      disp.disposeAsset({ assetId: asset.id, disposalDate: '2026-09-17', proceeds: 90000, proceedsAccountId: 'acc_1000' }),
    ).rejects.toThrow(/closed|not open/i);

    expect((await fixedAssetRepo.getById(asset.id))!.status).toBe('active'); // not disposed
    expect(await dispRepo.getAll()).toHaveLength(0);
  });

  it('previewDisposal returns the same figures without posting', async () => {
    const asset = await activeAsset(36500, 1);
    await depreciationService.runDepreciation('2026-01-31'); // carrying 33400
    const preview = await disposalServiceNoCatchUp.previewDisposal({
      assetId: asset.id,
      disposalDate: '2026-02-01',
      proceeds: 46000,
      proceedsAccountId: 'acc_1000',
      vatTreatment: 'inclusive',
      vatCode: 'STD',
    });
    expect(preview.vatAmount).toBeCloseTo(6000, 2);
    expect(preview.netProceeds).toBeCloseTo(40000, 2);
    expect(preview.gainLoss).toBeCloseTo(6600, 2);
    expect((await disposalServiceNoCatchUp.getDisposals())).toHaveLength(0);
  });
});
