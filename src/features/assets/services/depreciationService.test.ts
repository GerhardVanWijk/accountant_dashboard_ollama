import { describe, it, expect, beforeEach } from 'vitest';
import { DepreciationService, calculateMonthlyDepreciation } from './depreciationService';
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
import type { AccountingPeriod, AccountingPeriodStatus, FixedAsset } from '@/types';

/** A single full-year open period — the simple case for the plain-vanilla tests. */
function makeYearPeriod(): AccountingPeriod {
  return {
    id: 'period_2026',
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

/** Twelve monthly 2026 periods; `closedMonths` (1-based) are marked 'closed'. */
function makeMonthlyPeriods(closedMonths: number[] = []): AccountingPeriod[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    const status: AccountingPeriodStatus = closedMonths.includes(month) ? 'closed' : 'open';
    return {
      id: `period_2026_${mm}`,
      companyId: 'comp_test',
      financialYearId: 'fy_test',
      name: `2026-${mm}`,
      startDate: `2026-${mm}-01T00:00:00.000Z`,
      endDate: `2026-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`,
      status,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  });
}

describe('calculateMonthlyDepreciation (nominal display figure)', () => {
  it('straight-line: (cost - residual) / usefulLifeYears / 12', () => {
    expect(
      calculateMonthlyDepreciation({
        assetNumber: 'FA-1',
        cost: 120000,
        residualValue: 12000,
        usefulLifeYears: 3,
        depreciationMethod: 'straight_line',
        accumulatedDepreciation: 0,
      }),
    ).toBeCloseTo(3000, 2);
  });

  it('caps at the remaining depreciable base', () => {
    expect(
      calculateMonthlyDepreciation({
        assetNumber: 'FA-4',
        cost: 10000,
        residualValue: 1000,
        usefulLifeYears: 5,
        depreciationMethod: 'straight_line',
        accumulatedDepreciation: 8950,
      }),
    ).toBeCloseTo(50, 2);
  });

  it('returns 0 once fully depreciated', () => {
    expect(
      calculateMonthlyDepreciation({
        assetNumber: 'FA-5',
        cost: 10000,
        residualValue: 1000,
        usefulLifeYears: 5,
        depreciationMethod: 'straight_line',
        accumulatedDepreciation: 9000,
      }),
    ).toBe(0);
  });
});

describe('DepreciationService.runDepreciation', () => {
  let fixedAssetService: FixedAssetService;
  let fixedAssetRepository: MockFixedAssetRepository;
  let depreciationRepository: MockDepreciationEntryRepository;
  let revisionRepository: MockEstimateRevisionRepository;
  let journalEntryService: JournalEntryService;

  function makeService(periods: AccountingPeriod[]): DepreciationService {
    fixedAssetRepository = new MockFixedAssetRepository([]);
    depreciationRepository = new MockDepreciationEntryRepository([]);
    revisionRepository = new MockEstimateRevisionRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository(periods);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    const estimateRevisionExecutor = new FakeEstimateRevisionExecutor({ assets: fixedAssetRepository, revisions: revisionRepository });
    fixedAssetService = new FixedAssetService(fixedAssetRepository, journalEntryService, accountMapper, revisionRepository, depreciationRepository, estimateRevisionExecutor);
    const periodExecutor = new FakeDepreciationPeriodExecutor({ journal: journalEntryService, assets: fixedAssetRepository, depreciationEntries: depreciationRepository });
    return new DepreciationService(depreciationRepository, fixedAssetRepository, periodExecutor, periodRepository, revisionRepository);
  }

  async function activeAsset(overrides: Partial<FixedAsset> = {}): Promise<FixedAsset> {
    const created = await fixedAssetService.createFixedAsset({
      assetNumber: overrides.assetNumber ?? 'FA-A',
      name: overrides.name ?? 'Test Asset',
      category: 'plant_and_machinery',
      acquisitionDate: overrides.acquisitionDate ?? '2026-01-01',
      cost: overrides.cost ?? 36500,
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

  let depreciationService: DepreciationService;
  beforeEach(() => {
    depreciationService = makeService([makeYearPeriod()]);
  });

  it('posts one balanced combined journal per month across multiple assets', async () => {
    await activeAsset({ assetNumber: 'FA-A', cost: 36500, usefulLifeYears: 1 });
    await activeAsset({ assetNumber: 'FA-B', cost: 73000, usefulLifeYears: 2 });

    const result = await depreciationService.runDepreciation('2026-01-31');
    expect(result.entries).toHaveLength(2);
    expect(result.journalEntryIds).toHaveLength(1);

    const entry = await journalEntryService.getEntry(result.journalEntryIds[0]);
    expect(entry!.lines).toHaveLength(4);
    const totalDebit = entry!.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = entry!.lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
    expect((await journalEntryService.computeTrialBalance()).balanced).toBe(true);
  });

  it('day-count prorates the first month from the acquisition date', async () => {
    const asset = await activeAsset({ cost: 36500, usefulLifeYears: 1, acquisitionDate: '2026-01-15' });
    await depreciationService.runDepreciation('2026-01-31');
    const updated = await fixedAssetRepository.getById(asset.id);
    expect(updated!.accumulatedDepreciation).toBeCloseTo(1700, 2); // 100/day * 17 days
  });

  it('catches up 4 missed months as 4 separate month-dated journals — one ledger row per month', async () => {
    await activeAsset({ cost: 36600, usefulLifeYears: 5, acquisitionDate: '2026-06-01' });
    const result = await depreciationService.runDepreciation('2026-09-30');

    // one journal per accounting period, not one combined journal
    expect(result.journalEntryIds).toHaveLength(4);
    expect(result.entries.map((e) => e.periodEnd)).toEqual([
      '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30',
    ]);

    // each journal is dated inside its own month
    const dates = await Promise.all(
      result.journalEntryIds.map(async (id) => (await journalEntryService.getEntry(id))!.date.slice(0, 7)),
    );
    expect(dates).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);

    // each depreciation entry points at the journal for its own month
    for (const entry of result.entries) {
      const je = await journalEntryService.getEntry(entry.journalEntryId);
      expect(je!.date.slice(0, 7)).toBe(entry.periodEnd.slice(0, 7));
    }
    expect((await journalEntryService.computeTrialBalance()).balanced).toBe(true);
  });

  it('never depreciates an asset that is not yet available for use', async () => {
    await activeAsset({ acquisitionDate: '2026-07-01' });
    const result = await depreciationService.runDepreciation('2026-03-31');
    expect(result.entries).toHaveLength(0);
    expect(result.journalEntryIds).toHaveLength(0);
  });

  it('is idempotent — a second run for the same period finds nothing', async () => {
    await activeAsset();
    const first = await depreciationService.runDepreciation('2026-01-31');
    expect(first.entries).toHaveLength(1);
    const second = await depreciationService.runDepreciation('2026-01-31');
    expect(second.entries).toHaveLength(0);
  });

  it('flips to fully_depreciated once the base is exhausted, exactly at residual', async () => {
    const asset = await activeAsset({ cost: 36500, residualValue: 6500, usefulLifeYears: 1 });
    const result = await depreciationService.runDepreciation('2026-12-31');
    expect(result.entries).toHaveLength(12);
    const final = await fixedAssetRepository.getById(asset.id);
    expect(final!.status).toBe('fully_depreciated');
    expect(final!.accumulatedDepreciation).toBeCloseTo(30000, 2);
  });

  it('excludes draft and disposed assets', async () => {
    await fixedAssetService.createFixedAsset({
      assetNumber: 'FA-DRAFT',
      name: 'Never posted',
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

  it('preview matches what the run actually posts', async () => {
    await activeAsset({ assetNumber: 'FA-A', cost: 36600, usefulLifeYears: 5, acquisitionDate: '2026-06-01' });
    const preview = await depreciationService.previewDepreciation('2026-09-30');
    expect(preview.periods.map((p) => p.label)).toEqual([
      'June 2026', 'July 2026', 'August 2026', 'September 2026',
    ]);
    expect(preview.periods.every((p) => p.status === 'ready')).toBe(true);
    expect(preview.hasBlockedPeriods).toBe(false);
    expect(preview.totalDebit).toBeCloseTo(preview.totalCredit, 2);

    const run = await depreciationService.runDepreciation('2026-09-30');
    const posted = run.entries.reduce((s, e) => s + e.amount, 0);
    expect(posted).toBeCloseTo(preview.totalCharge, 2);
  });

  describe('locked-period catch-up', () => {
    beforeEach(() => {
      // June open, July CLOSED, August open, September open
      depreciationService = makeService(makeMonthlyPeriods([7]));
    });

    it('posts June, blocks July onward, and never rolls July into a later month', async () => {
      const asset = await activeAsset({ cost: 36600, usefulLifeYears: 5, acquisitionDate: '2026-06-01' });
      const preview = await depreciationService.previewDepreciation('2026-09-30');

      expect(preview.periods.map((p) => `${p.label}:${p.status}`)).toEqual([
        'June 2026:ready',
        'July 2026:blocked',
        'August 2026:blocked',
        'September 2026:blocked',
      ]);
      expect(preview.periods[1].blockedReason).toMatch(/closed/i);
      expect(preview.periods[2].blockedReason).toMatch(/July 2026/);
      expect(preview.hasBlockedPeriods).toBe(true);

      const result = await depreciationService.runDepreciation('2026-09-30');
      expect(result.journalEntryIds).toHaveLength(1);
      expect(result.entries.map((e) => e.periodEnd)).toEqual(['2026-06-30']);
      expect(result.blockedPeriods.map((p) => p.label)).toEqual(['July 2026', 'August 2026', 'September 2026']);

      // asset accumulated only reflects June — August/September were NOT applied
      const updated = await fixedAssetRepository.getById(asset.id);
      const june = result.entries[0];
      expect(updated!.accumulatedDepreciation).toBeCloseTo(june.accumulatedDepreciationAfter, 2);

      // the one journal posted is dated in June, not September
      const je = await journalEntryService.getEntry(result.journalEntryIds[0]);
      expect(je!.date.slice(0, 7)).toBe('2026-06');
    });

    it('with an all-open calendar the same run posts four month-dated journals', async () => {
      depreciationService = makeService(makeMonthlyPeriods([]));
      await activeAsset({ cost: 36600, usefulLifeYears: 5, acquisitionDate: '2026-06-01' });
      const result = await depreciationService.runDepreciation('2026-09-30');
      expect(result.journalEntryIds).toHaveLength(4);
      expect(result.blockedPeriods).toHaveLength(0);
    });

    it('a revision effective after a closed month does not let its depreciation bypass the lock', async () => {
      depreciationService = makeService(makeMonthlyPeriods([6])); // June CLOSED
      const asset = await activeAsset({ cost: 120000, usefulLifeYears: 5, acquisitionDate: '2026-05-01' });
      // revise effective August — a later, open month
      await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-08-01', usefulLifeYears: 8, residualValue: 20000 });

      const preview = await depreciationService.previewDepreciation('2026-09-30');
      // May ready; June closed → June + everything after (incl. the revised months) blocked
      expect(preview.periods.map((p) => `${p.label}:${p.status}`)).toEqual([
        'May 2026:ready',
        'June 2026:blocked',
        'July 2026:blocked',
        'August 2026:blocked',
        'September 2026:blocked',
      ]);
      const result = await depreciationService.runDepreciation('2026-09-30');
      expect(result.entries.map((e) => e.periodEnd)).toEqual(['2026-05-31']);
    });
  });

  describe('catchUpToDate', () => {
    it('brings a single asset current to a mid-month date across several months', async () => {
      const asset = await activeAsset({ cost: 36500, usefulLifeYears: 1, acquisitionDate: '2026-01-01' });
      const result = await depreciationService.catchUpToDate(asset.id, '2026-02-15');
      expect(result.entries.map((e) => e.periodEnd)).toEqual(['2026-01-31', '2026-02-15']);
      expect(result.journalEntryIds).toHaveLength(2);
      const updated = await fixedAssetRepository.getById(asset.id);
      expect(updated!.accumulatedDepreciation).toBeCloseTo(4600, 2); // 31 + 15 days at 100/day
    });

    it('throws when a month up to the target date falls in a closed period (no stale-value disposal)', async () => {
      depreciationService = makeService(makeMonthlyPeriods([8])); // August closed
      const asset = await activeAsset({ cost: 36600, usefulLifeYears: 5, acquisitionDate: '2026-06-01' });
      await expect(depreciationService.catchUpToDate(asset.id, '2026-09-17')).rejects.toThrow(/closed|not open/i);
      // nothing posted
      expect(await depreciationService.getDepreciationHistory(asset.id)).toHaveLength(0);
    });
  });
});
