import type { Account, AssetDisposal, DepreciationEntry, EstimateRevision, FixedAsset, ID } from '@/types';
import { EPSILON, isAfterDate, round2 } from './depreciationMath';

export type AssetIntegritySeverity = 'error' | 'warning';

export interface AssetIntegrityException {
  assetId: ID;
  assetNumber: string;
  code: string;
  severity: AssetIntegritySeverity;
  message: string;
}

export interface AssetIntegrityReport {
  exceptions: AssetIntegrityException[];
  checkedAssets: number;
  errorCount: number;
  warningCount: number;
  isClean: boolean;
}

export interface AssetIntegrityInput {
  assets: FixedAsset[];
  depreciationEntries: DepreciationEntry[];
  disposals: AssetDisposal[];
  accounts: Account[];
  /**
   * Optional (Review 4 Item K) — when supplied, each asset's latest revision
   * (by effectiveDate) is compared against the `fixed_assets` "current
   * estimate" cache columns. `revise_fixed_asset_estimate` (migration 0084)
   * keeps them in lockstep going forward, so a mismatch here means either a
   * pre-migration-0084 partial write, or a manual/legacy edit bypassing the
   * service — surfaced for a human to correct, never auto-fixed.
   */
  estimateRevisions?: EstimateRevision[];
}

/**
 * Read-side integrity sweep over the Fixed Asset Register
 * (SA_ACCOUNTING_MASTER_SPEC §17 applied to PPE). Never mutates data — a
 * discrepancy is surfaced for a human to correct through a legitimate
 * accounting workflow, exactly like reconcileInventory() /
 * accountingIntegrityAuditService.
 */
export function auditAssetRegisterIntegrity(input: AssetIntegrityInput): AssetIntegrityReport {
  const { assets, depreciationEntries, disposals } = input;
  const accountIds = new Set(input.accounts.map((a) => a.id));
  const entriesByAsset = new Map<ID, DepreciationEntry[]>();
  for (const entry of depreciationEntries) {
    const list = entriesByAsset.get(entry.assetId) ?? [];
    list.push(entry);
    entriesByAsset.set(entry.assetId, list);
  }
  const disposalByAsset = new Map(disposals.map((d) => [d.assetId, d]));
  const revisionsByAsset = new Map<ID, EstimateRevision[]>();
  for (const revision of input.estimateRevisions ?? []) {
    const list = revisionsByAsset.get(revision.assetId) ?? [];
    list.push(revision);
    revisionsByAsset.set(revision.assetId, list);
  }

  const exceptions: AssetIntegrityException[] = [];
  const add = (asset: FixedAsset, code: string, severity: AssetIntegritySeverity, message: string) =>
    exceptions.push({ assetId: asset.id, assetNumber: asset.assetNumber, code, severity, message });

  for (const asset of assets) {
    const base = round2(asset.cost - asset.residualValue);
    const carrying = round2(asset.cost - asset.accumulatedDepreciation);
    const entries = (entriesByAsset.get(asset.id) ?? []).slice().sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    const posted = asset.status !== 'draft';

    // --- Account mappings ------------------------------------------------
    if (posted) {
      if (!accountIds.has(asset.glAssetAccountId)) {
        add(asset, 'missing_cost_account', 'error', 'Cost account mapping does not resolve to a real Chart of Accounts entry.');
      }
      if (!accountIds.has(asset.glAccumulatedDepreciationAccountId)) {
        add(asset, 'missing_accumulated_depreciation_account', 'error', 'Accumulated-depreciation account mapping does not resolve.');
      }
      if (!accountIds.has(asset.glDepreciationExpenseAccountId)) {
        add(asset, 'missing_depreciation_expense_account', 'error', 'Depreciation-expense account mapping does not resolve.');
      }
    }

    // --- Carrying value / accumulated depreciation ---------------------
    if (asset.accumulatedDepreciation < -EPSILON) {
      add(asset, 'negative_accumulated_depreciation', 'error', 'Accumulated depreciation is negative.');
    }
    if (asset.accumulatedDepreciation > base + EPSILON) {
      add(asset, 'over_depreciated', 'error', `Accumulated depreciation (${asset.accumulatedDepreciation.toFixed(2)}) exceeds the depreciable base (${base.toFixed(2)}).`);
    }
    if (carrying < asset.residualValue - EPSILON && asset.status !== 'disposed') {
      add(asset, 'carrying_below_residual', 'error', `Carrying value (${carrying.toFixed(2)}) is below residual value (${asset.residualValue.toFixed(2)}).`);
    }

    // --- Ledger vs register cross-check -------------------------------
    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      if (asset.status !== 'disposed' && Math.abs(last.accumulatedDepreciationAfter - asset.accumulatedDepreciation) > EPSILON) {
        add(asset, 'ledger_register_mismatch', 'error', `Register accumulated depreciation (${asset.accumulatedDepreciation.toFixed(2)}) does not match the last depreciation entry (${last.accumulatedDepreciationAfter.toFixed(2)}).`);
      }
      for (const entry of entries) {
        if (isAfterDate(asset.acquisitionDate, entry.periodEnd)) {
          add(asset, 'depreciation_before_acquisition', 'error', `A depreciation charge dated ${entry.periodEnd} predates the acquisition date ${asset.acquisitionDate}.`);
          break;
        }
      }
      // duplicate period-end
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry.periodEnd)) {
          add(asset, 'duplicate_depreciation_period', 'error', `More than one depreciation charge exists for period end ${entry.periodEnd}.`);
          break;
        }
        seen.add(entry.periodEnd);
      }
    }

    // --- Status consistency ------------------------------------------
    if (asset.status === 'fully_depreciated' && base - asset.accumulatedDepreciation > EPSILON) {
      add(asset, 'not_actually_fully_depreciated', 'warning', 'Marked fully depreciated but the depreciable base is not exhausted.');
    }
    if (asset.status === 'active' && asset.accumulatedDepreciation >= base - EPSILON && base > EPSILON) {
      add(asset, 'should_be_fully_depreciated', 'warning', 'Depreciable base is exhausted but the asset is still marked active.');
    }

    // --- Disposal consistency --------------------------------------
    const disposal = disposalByAsset.get(asset.id);
    if (asset.status === 'disposed') {
      if (!disposal) {
        add(asset, 'disposed_without_record', 'error', 'Status is disposed but no disposal record exists.');
      }
      if (!asset.disposalJournalEntryId) {
        add(asset, 'disposed_without_journal', 'error', 'Status is disposed but no disposal journal entry is linked.');
      }
      for (const entry of entries) {
        if (asset.disposalDate && isAfterDate(entry.periodEnd, asset.disposalDate)) {
          add(asset, 'depreciation_after_disposal', 'error', `A depreciation charge dated ${entry.periodEnd} is after the disposal date ${asset.disposalDate}.`);
          break;
        }
      }
    } else if (disposal) {
      add(asset, 'disposal_record_without_disposed_status', 'error', `A disposal record exists but the asset status is "${asset.status}".`);
    }

    // --- Source / capitalisation link ------------------------------
    if (posted && asset.status !== 'disposed' && !asset.journalEntryId && !asset.sourceBillId) {
      add(asset, 'missing_capitalisation_link', 'warning', 'Capitalized asset has no linked capitalization journal or source bill.');
    }

    // --- Estimate cache vs. revision timeline (Review 4 Item K) ---------
    if (input.estimateRevisions) {
      const revisions = revisionsByAsset.get(asset.id) ?? [];
      if (revisions.length > 0) {
        const latest = revisions.reduce((max, r) => (r.effectiveDate > max.effectiveDate ? r : max));
        const mismatched =
          Math.abs(latest.usefulLifeYears - asset.usefulLifeYears) > EPSILON ||
          Math.abs(latest.residualValue - asset.residualValue) > EPSILON ||
          latest.depreciationMethod !== asset.depreciationMethod ||
          Math.abs((latest.reducingBalanceRatePercent ?? 0) - (asset.reducingBalanceRatePercent ?? 0)) > EPSILON;
        if (mismatched) {
          add(
            asset,
            'estimate_snapshot_mismatch',
            'warning',
            `The current-estimate cache does not match the latest estimate revision (effective ${latest.effectiveDate.slice(0, 10)}) — the revision table remains authoritative for depreciation; correct the cache via a further revision, never by editing it directly.`,
          );
        }
      }
    }
  }

  const errorCount = exceptions.filter((e) => e.severity === 'error').length;
  const warningCount = exceptions.length - errorCount;
  return {
    exceptions,
    checkedAssets: assets.length,
    errorCount,
    warningCount,
    isClean: exceptions.length === 0,
  };
}
