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
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { seedTaxRates } from '@/mock-data/taxRates';
import type { AccountingPeriod } from '@/types';

/**
 * Fixed Assets accounting-integrity Review 4 (Final Transactional
 * Completion) — the S. Failure Test Matrix from the review brief.
 *
 * These tests exercise the TypeScript-visible CONTRACT of the atomic
 * executors (Fake{Disposal,DepreciationPeriod,EstimateRevision}Executor) —
 * exactly one call per accounting event, all-or-nothing, idempotent on
 * retry. The Fakes are deliberately built to make this provable without a
 * live Postgres: every write is validated BEFORE any store is touched, and
 * `beforeCommit` fires (when the test asks it to) at that same point — so a
 * thrown error there proves NOTHING was written to any of the underlying
 * mock stores, the same observable guarantee a single plpgsql function
 * invocation gives in production (one implicit transaction — the same
 * primitive `create_journal_entry_with_lines` and `apply_customer_deposit`
 * already rely on, see docs/FIXED_ASSETS.md). The REAL RPCs' rollback
 * itself is a Postgres guarantee, not something re-provable inside Vitest
 * without a live database (migrations are authored, not applied — see
 * fixedAssetTransactionalRpcsMigration.test.ts for their static-SQL
 * contract instead).
 */

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

describe('Review 4 Failure Test Matrix', () => {
  let fixedAssetRepository: MockFixedAssetRepository;
  let depreciationRepository: MockDepreciationEntryRepository;
  let revisionRepository: MockEstimateRevisionRepository;
  let disposalRepository: MockAssetDisposalRepository;
  let vatSourceRepository: MockVatSourceEntryRepository;
  let journalEntryService: JournalEntryService;
  let accountMapper: AccountMappingService;
  let fixedAssetService: FixedAssetService;
  let depreciationService: DepreciationService;
  let fail: { value: boolean };

  async function activeAsset(cost: number, usefulLifeYears = 5, residualValue = 0) {
    const created = await fixedAssetService.createFixedAsset({
      assetNumber: `FA-${cost}-${Math.random().toString(36).slice(2, 6)}`,
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
    depreciationRepository = new MockDepreciationEntryRepository([]);
    revisionRepository = new MockEstimateRevisionRepository([]);
    disposalRepository = new MockAssetDisposalRepository([]);
    vatSourceRepository = new MockVatSourceEntryRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    fail = { value: false };

    const estimateRevisionExecutor = new FakeEstimateRevisionExecutor({
      assets: fixedAssetRepository,
      revisions: revisionRepository,
      beforeCommit: () => {
        if (fail.value) throw new Error('simulated failure inside revise_fixed_asset_estimate');
      },
    });
    fixedAssetService = new FixedAssetService(fixedAssetRepository, journalEntryService, accountMapper, revisionRepository, depreciationRepository, estimateRevisionExecutor);

    const periodExecutor = new FakeDepreciationPeriodExecutor({
      journal: journalEntryService,
      assets: fixedAssetRepository,
      depreciationEntries: depreciationRepository,
      beforeCommit: () => {
        if (fail.value) throw new Error('simulated failure inside post_asset_depreciation_period');
      },
    });
    depreciationService = new DepreciationService(depreciationRepository, fixedAssetRepository, periodExecutor, periodRepository, revisionRepository);
  });

  function makeDisposalStack() {
    const taxRateService = new TaxRateService(new MockTaxRateRepository(seedTaxRates), new AuditLogService(new MockAuditLogRepository()));
    const disposalExecutor = new FakeDisposalExecutor({
      journal: journalEntryService,
      assets: fixedAssetRepository,
      disposals: disposalRepository,
      vatSourceEntries: vatSourceRepository,
      estimateRevisions: revisionRepository,
      beforeCommit: () => {
        if (fail.value) throw new Error('simulated failure inside post_fixed_asset_disposal');
      },
    });
    const disposalService = new AssetDisposalService(disposalRepository, fixedAssetRepository, disposalExecutor, accountMapper, undefined, taxRateService);
    return { disposalService, disposalExecutor };
  }

  // ======================================================================
  // DISPOSAL
  // ======================================================================
  describe('DISPOSAL', () => {
    it('a mid-transaction failure (e.g. the VAT-evidence step) leaves NO journal, NO disposal row, NO VAT row, and the asset still active', async () => {
      const { disposalService } = makeDisposalStack();
      const asset = await activeAsset(11500);

      fail.value = true;
      await expect(
        disposalService.disposeAsset({
          assetId: asset.id,
          disposalDate: '2026-02-01',
          proceeds: 11500,
          proceedsAccountId: 'acc_1000',
          vatTreatment: 'exclusive',
        }),
      ).rejects.toThrow(/simulated failure/);

      expect((await journalEntryService.getEntries()).filter((e) => e.source === 'asset_disposal')).toHaveLength(0);
      expect(await disposalRepository.getByAsset(asset.id)).toBeUndefined();
      expect(await vatSourceRepository.getAll()).toHaveLength(0);
      expect((await fixedAssetRepository.getById(asset.id))!.status).toBe('active');
    });

    it('retry after a failed attempt succeeds exactly once (one journal, one disposal row, one VAT row)', async () => {
      const { disposalService } = makeDisposalStack();
      const asset = await activeAsset(11500);
      const disposalId = 'disp-retry-test-id';

      fail.value = true;
      await expect(
        disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-02-01', proceeds: 11500, proceedsAccountId: 'acc_1000', vatTreatment: 'exclusive', disposalId }),
      ).rejects.toThrow();

      fail.value = false;
      const disposal = await disposalService.disposeAsset({
        assetId: asset.id,
        disposalDate: '2026-02-01',
        proceeds: 11500,
        proceedsAccountId: 'acc_1000',
        vatTreatment: 'exclusive',
        disposalId,
      });

      expect(disposal).toBeDefined();
      expect(await disposalRepository.getAll()).toHaveLength(1);
      expect(await vatSourceRepository.getAll()).toHaveLength(1);
      expect((await journalEntryService.getEntries()).filter((e) => e.source === 'asset_disposal')).toHaveLength(1);
      expect((await fixedAssetRepository.getById(asset.id))!.status).toBe('disposed');
    });

    it('re-submitting the SAME disposalId after a SUCCESSFUL disposal is idempotent — no duplicate', async () => {
      const { disposalService, disposalExecutor } = makeDisposalStack();
      const asset = await activeAsset(11500);
      const disposalId = 'disp-idempotent-id';

      const first = await disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-02-01', proceeds: 11500, proceedsAccountId: 'acc_1000', disposalId });
      const result = await disposalExecutor.postDisposal({
        disposalId,
        assetId: asset.id,
        disposalDate: '2026-02-01',
        memo: 'retry',
        source: 'asset_disposal',
        lines: [],
        proceeds: 11500,
        carryingValue: 11500,
        accumulatedDepreciation: 0,
        gainLoss: 0,
      });

      expect(result.idempotent).toBe(true);
      expect(result.disposal.id).toBe(first.id);
      expect(await disposalRepository.getAll()).toHaveLength(1);
    });

    it('a second, genuinely new disposal attempt on an already-disposed asset is refused — no double disposal', async () => {
      const { disposalService } = makeDisposalStack();
      const asset = await activeAsset(11500);
      await disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-02-01', proceeds: 11500, proceedsAccountId: 'acc_1000' });

      await expect(
        disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-02-02', proceeds: 5000, proceedsAccountId: 'acc_1000' }),
      ).rejects.toThrow(/already been disposed/);
      expect(await disposalRepository.getAll()).toHaveLength(1);
    });

    it('refuses disposal when a future-effective estimate revision exists (Item L)', async () => {
      const { disposalService } = makeDisposalStack();
      const asset = await activeAsset(120000, 10);
      await revisionRepository.create({
        id: '', assetId: asset.id, effectiveDate: '2026-12-01',
        usefulLifeYears: 12, residualValue: 0, depreciationMethod: 'straight_line',
        previousUsefulLifeYears: 10, previousResidualValue: 0, previousDepreciationMethod: 'straight_line',
        createdAt: '', updatedAt: '',
      });

      await expect(
        disposalService.disposeAsset({ assetId: asset.id, disposalDate: '2026-11-15', proceeds: 100000, proceedsAccountId: 'acc_1000' }),
      ).rejects.toThrow(/estimate revision effective/);
      expect((await fixedAssetRepository.getById(asset.id))!.status).toBe('active');
    });
  });

  // ======================================================================
  // DEPRECIATION
  // ======================================================================
  describe('DEPRECIATION', () => {
    it('a mid-transaction failure leaves NO journal and NO depreciation_entries for that month', async () => {
      await activeAsset(36500, 1);

      fail.value = true;
      await expect(depreciationService.runDepreciation('2026-01-31')).rejects.toThrow(/simulated failure/);

      expect(await depreciationRepository.getAll()).toHaveLength(0);
      expect((await journalEntryService.getEntries()).filter((e) => e.source === 'depreciation')).toHaveLength(0);
    });

    it('retry after a failed period posts exactly one entry for that asset/month', async () => {
      await activeAsset(36500, 1);

      fail.value = true;
      await expect(depreciationService.runDepreciation('2026-01-31')).rejects.toThrow();

      fail.value = false;
      const result = await depreciationService.runDepreciation('2026-01-31');
      expect(result.entries).toHaveLength(1);
      expect(await depreciationRepository.getAll()).toHaveLength(1);
    });

    it('an asset cannot receive two depreciation entries for the same month (hard per-asset-per-month rule)', async () => {
      const asset = await activeAsset(36500, 1);
      await depreciationService.runDepreciation('2026-01-31');
      expect(await depreciationRepository.getByAsset(asset.id)).toHaveLength(1);

      // A second, independent catch-up call targeting the SAME already-posted
      // month for the SAME asset must not slip a duplicate entry past the
      // executor even with a fresh run id (mirrors the DB's hard
      // UNIQUE (company_id, asset_id, period_end) backstop, migration 0081).
      await expect(depreciationService.catchUpToDate(asset.id, '2026-01-31')).resolves.toBeDefined();
      expect(await depreciationRepository.getByAsset(asset.id)).toHaveLength(1); // still one — buildRunPlan excludes an already-posted month
    });

    it('a 4-month catch-up still posts 4 separate period journals, each dated in its own month', async () => {
      const asset = await activeAsset(365000, 5); // 200/day straight-line-ish
      const result = await depreciationService.runDepreciation('2026-04-30');
      const months = new Set(result.entries.map((e) => e.periodEnd.slice(0, 7)));
      expect(months.size).toBe(4);
      expect(result.journalEntryIds).toHaveLength(4);
      for (const entry of result.entries) {
        const je = await journalEntryService.getEntry(entry.journalEntryId);
        expect(je!.date.slice(0, 7)).toBe(entry.periodEnd.slice(0, 7));
      }
      void asset;
    });
  });

  // ======================================================================
  // ESTIMATE REVISION
  // ======================================================================
  describe('ESTIMATE REVISION', () => {
    it('a mid-transaction failure leaves NEITHER the revision NOR the cache changed (the two writes are now one)', async () => {
      const asset = await activeAsset(120000, 10);

      fail.value = true;
      await expect(
        fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-02-01', usefulLifeYears: 12 }),
      ).rejects.toThrow(/simulated failure/);

      expect(await revisionRepository.getByAsset(asset.id)).toHaveLength(0);
      const after = await fixedAssetRepository.getById(asset.id);
      expect(after!.usefulLifeYears).toBe(10); // unchanged — no orphaned cache write
    });

    it('retry after a failed revision creates exactly one revision', async () => {
      const asset = await activeAsset(120000, 10);

      fail.value = true;
      await expect(fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-02-01', usefulLifeYears: 12 })).rejects.toThrow();

      fail.value = false;
      const updated = await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-02-01', usefulLifeYears: 12 });
      expect(updated.usefulLifeYears).toBe(12);
      expect(await revisionRepository.getByAsset(asset.id)).toHaveLength(1);
    });

    it('the effective-date unique key is enforced — a second call for the SAME date does not create a duplicate revision', async () => {
      const asset = await activeAsset(120000, 10);
      await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-02-01', usefulLifeYears: 12 });

      // Same effective_date resubmitted (e.g. a lost-response retry) — the
      // natural (company, asset, effective_date) key means this is treated
      // as the same logical revision, not a second one.
      await fixedAssetService.reviseEstimate(asset.id, { effectiveDate: '2026-02-01', usefulLifeYears: 12 });
      expect(await revisionRepository.getByAsset(asset.id)).toHaveLength(1);
    });
  });
});
