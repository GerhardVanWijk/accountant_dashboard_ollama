import { describe, it, expect } from 'vitest';
import { auditAssetRegisterIntegrity } from './assetRegisterIntegrityService';
import { seedAccounts } from '@/mock-data/accounts';
import type { AssetDisposal, DepreciationEntry, EstimateRevision, FixedAsset } from '@/types';

function asset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: 'a1', createdAt: '', updatedAt: '',
    assetNumber: 'FA-0001', name: 'Asset', category: 'plant_and_machinery',
    acquisitionDate: '2026-01-01', cost: 100000, residualValue: 10000, usefulLifeYears: 5,
    depreciationMethod: 'straight_line',
    glAssetAccountId: 'acc_1500', glAccumulatedDepreciationAccountId: 'acc_1590', glDepreciationExpenseAccountId: 'acc_5200',
    accumulatedDepreciation: 0, status: 'active', journalEntryId: 'je_1',
    ...overrides,
  };
}

function entry(overrides: Partial<DepreciationEntry> = {}): DepreciationEntry {
  return {
    id: 'd1', createdAt: '', updatedAt: '', assetId: 'a1', periodEnd: '2026-01-31',
    amount: 1500, accumulatedDepreciationAfter: 1500, carryingValueAfter: 98500, journalEntryId: 'je_2',
    ...overrides,
  };
}

const clean = { assets: [asset()], depreciationEntries: [], disposals: [] as AssetDisposal[], accounts: seedAccounts };

describe('auditAssetRegisterIntegrity', () => {
  it('reports a clean register', () => {
    const report = auditAssetRegisterIntegrity(clean);
    expect(report.isClean).toBe(true);
    expect(report.exceptions).toHaveLength(0);
  });

  it('flags accumulated depreciation above the depreciable base', () => {
    const report = auditAssetRegisterIntegrity({ ...clean, assets: [asset({ accumulatedDepreciation: 95000 })] });
    expect(report.exceptions.some((e) => e.code === 'over_depreciated')).toBe(true);
    expect(report.errorCount).toBeGreaterThan(0);
  });

  it('flags a register total that disagrees with the last depreciation entry', () => {
    const report = auditAssetRegisterIntegrity({
      ...clean,
      assets: [asset({ accumulatedDepreciation: 5000 })],
      depreciationEntries: [entry({ accumulatedDepreciationAfter: 1500 })],
    });
    expect(report.exceptions.some((e) => e.code === 'ledger_register_mismatch')).toBe(true);
  });

  it('flags a depreciation charge dated before the acquisition date', () => {
    const report = auditAssetRegisterIntegrity({
      ...clean,
      assets: [asset({ acquisitionDate: '2026-06-01', accumulatedDepreciation: 1500 })],
      depreciationEntries: [entry({ periodEnd: '2026-01-31' })],
    });
    expect(report.exceptions.some((e) => e.code === 'depreciation_before_acquisition')).toBe(true);
  });

  it('flags a depreciation charge dated after disposal', () => {
    const report = auditAssetRegisterIntegrity({
      ...clean,
      assets: [asset({ status: 'disposed', disposalDate: '2026-03-01', disposalJournalEntryId: 'je_9', accumulatedDepreciation: 6000 })],
      depreciationEntries: [entry({ periodEnd: '2026-05-31', accumulatedDepreciationAfter: 6000 })],
      disposals: [{ id: 'x', createdAt: '', updatedAt: '', assetId: 'a1', disposalDate: '2026-03-01', proceeds: 1, carryingValueAtDisposal: 1, accumulatedDepreciationAtDisposal: 6000, gainLoss: 0, journalEntryId: 'je_9' }],
    });
    expect(report.exceptions.some((e) => e.code === 'depreciation_after_disposal')).toBe(true);
  });

  it('flags a disposed asset with no disposal record', () => {
    const report = auditAssetRegisterIntegrity({
      ...clean,
      assets: [asset({ status: 'disposed', disposalDate: '2026-03-01' })],
    });
    expect(report.exceptions.some((e) => e.code === 'disposed_without_record')).toBe(true);
    expect(report.exceptions.some((e) => e.code === 'disposed_without_journal')).toBe(true);
  });

  it('flags an unresolvable account mapping', () => {
    const report = auditAssetRegisterIntegrity({ ...clean, assets: [asset({ glAssetAccountId: 'acc_does_not_exist' })] });
    expect(report.exceptions.some((e) => e.code === 'missing_cost_account')).toBe(true);
  });

  it('flags a status that should be fully_depreciated', () => {
    const report = auditAssetRegisterIntegrity({ ...clean, assets: [asset({ accumulatedDepreciation: 90000, status: 'active' })] });
    expect(report.exceptions.some((e) => e.code === 'should_be_fully_depreciated')).toBe(true);
  });

  // Review 4 Item K — read-side detection of a fixed_assets cache that has
  // drifted from the authoritative revision table (legacy edit / a partial
  // write predating migration 0084's atomic revise_fixed_asset_estimate).
  describe('estimate_snapshot_mismatch (Review 4 Item K)', () => {
    function revision(overrides: Partial<EstimateRevision> = {}): EstimateRevision {
      return {
        id: 'r1', createdAt: '', updatedAt: '', assetId: 'a1', effectiveDate: '2026-06-01',
        usefulLifeYears: 8, residualValue: 15000, depreciationMethod: 'straight_line',
        previousUsefulLifeYears: 5, previousResidualValue: 10000, previousDepreciationMethod: 'straight_line',
        ...overrides,
      };
    }

    it('is silent when no estimateRevisions are supplied — read-only, opt-in', () => {
      const report = auditAssetRegisterIntegrity({ ...clean, assets: [asset({ usefulLifeYears: 999 })] });
      expect(report.exceptions.some((e) => e.code === 'estimate_snapshot_mismatch')).toBe(false);
    });

    it('is silent when the cache matches the latest revision', () => {
      const report = auditAssetRegisterIntegrity({
        ...clean,
        assets: [asset({ usefulLifeYears: 8, residualValue: 15000 })],
        estimateRevisions: [revision()],
      });
      expect(report.exceptions.some((e) => e.code === 'estimate_snapshot_mismatch')).toBe(false);
    });

    it('flags a cache that disagrees with the latest revision', () => {
      const report = auditAssetRegisterIntegrity({
        ...clean,
        assets: [asset({ usefulLifeYears: 5, residualValue: 10000 })], // never resynced to the revision below
        estimateRevisions: [revision()],
      });
      const ex = report.exceptions.find((e) => e.code === 'estimate_snapshot_mismatch');
      expect(ex).toBeDefined();
      expect(ex!.severity).toBe('warning'); // surfaced, never auto-fixed
      expect(ex!.message).toContain('2026-06-01');
    });

    it('compares against the LATEST revision by effective_date, not insertion order', () => {
      const report = auditAssetRegisterIntegrity({
        ...clean,
        assets: [asset({ usefulLifeYears: 8, residualValue: 15000 })], // matches the June revision, not the later August one
        estimateRevisions: [
          revision({ id: 'r2', effectiveDate: '2026-08-01', usefulLifeYears: 10, residualValue: 20000 }),
          revision({ id: 'r1', effectiveDate: '2026-06-01' }),
        ],
      });
      expect(report.exceptions.some((e) => e.code === 'estimate_snapshot_mismatch')).toBe(true);
    });
  });
});
