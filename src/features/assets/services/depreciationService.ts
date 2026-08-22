import type { DepreciationEntry, FixedAsset, FixedAssetStatus, ID, JournalEntry } from '@/types';
import type { IDepreciationEntryRepository } from '../repositories/IDepreciationEntryRepository';
import type { NewJournalLineInput } from '@/features/accounting/services';

/** Half a cent — same rounding tolerance as journalEntryService.ts. */
const EPSILON = 0.005;

export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

/** Minimal surface of FixedAssetRepository this service depends on. */
export interface AssetStore {
  getAll(): Promise<FixedAsset[]>;
  update(id: ID, patch: Partial<FixedAsset>): Promise<FixedAsset>;
}

export interface DepreciationRunResult {
  entries: DepreciationEntry[];
  /** Undefined when no asset was eligible for this period — nothing was posted. */
  journalEntryId?: ID;
}

/**
 * The depreciable base (cost - residualValue) can never be exceeded by
 * accumulated depreciation, regardless of method — the last period's
 * charge is clipped to whatever remains, mirroring
 * billService.splitDeductibleVat()'s "cap, never overshoot" pattern.
 * Shared between the real run and any future preview UI so they can never
 * disagree, same rationale as stockLotService's previewFifoCost()/
 * consumeFifoLots() sharing one lot-walking algorithm.
 */
export function calculateMonthlyDepreciation(
  asset: Pick<
    FixedAsset,
    'assetNumber' | 'cost' | 'residualValue' | 'usefulLifeYears' | 'depreciationMethod' | 'reducingBalanceRatePercent' | 'accumulatedDepreciation'
  >,
): number {
  const depreciableBase = asset.cost - asset.residualValue;
  const remaining = Math.max(0, depreciableBase - asset.accumulatedDepreciation);
  if (remaining <= EPSILON) return 0;

  if (asset.depreciationMethod === 'straight_line') {
    return Math.min(depreciableBase / asset.usefulLifeYears / 12, remaining);
  }

  if (asset.reducingBalanceRatePercent === undefined) {
    throw new Error(
      `Asset "${asset.assetNumber}" uses the reducing-balance method but has no reducingBalanceRatePercent set.`,
    );
  }
  const carryingValue = asset.cost - asset.accumulatedDepreciation;
  const monthlyCharge = (carryingValue * asset.reducingBalanceRatePercent) / 100 / 12;
  return Math.min(monthlyCharge, remaining);
}

/**
 * The depreciation engine (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 7).
 * runDepreciation() posts ONE combined journal entry per run covering
 * every eligible asset — a DR Depreciation Expense / CR Accumulated
 * Depreciation line pair per asset, still a single balanced entry even
 * when assets map to different GL accounts (perfectly valid double-entry:
 * many debit lines against many credit lines, so long as the totals
 * match) — rather than one entry per asset, keeping the ledger readable
 * for a business with more than a handful of assets.
 */
export class DepreciationService {
  constructor(
    private readonly depreciationRepository: IDepreciationEntryRepository,
    private readonly assetStore: AssetStore,
    private readonly journalPoster: JournalPoster,
  ) {}

  async getDepreciationHistory(assetId?: ID): Promise<DepreciationEntry[]> {
    if (assetId) {
      return this.depreciationRepository.getByAsset(assetId);
    }
    return this.depreciationRepository.getAll();
  }

  /**
   * Runs depreciation for every 'active' asset not already depreciated for
   * this exact `periodEnd` (idempotency guard — same class as
   * purchaseOrderService.recordReceipt()'s "reject an already-received
   * PO"). Assets that are fully depreciated, or already run for this
   * period, are silently skipped rather than erroring — a "nothing due"
   * outcome (empty `entries`, no `journalEntryId`) is a normal result of
   * running depreciation twice in the same period or after everything has
   * already fully depreciated, not a failure.
   */
  async runDepreciation(periodEnd: string, postedByUserId?: ID): Promise<DepreciationRunResult> {
    const assets = await this.assetStore.getAll();
    const eligible: { asset: FixedAsset; amount: number }[] = [];

    for (const asset of assets) {
      if (asset.status !== 'active') continue;
      const history = await this.depreciationRepository.getByAsset(asset.id);
      if (history.some((entry) => entry.periodEnd === periodEnd)) continue;
      const amount = calculateMonthlyDepreciation(asset);
      if (amount <= EPSILON) continue;
      eligible.push({ asset, amount });
    }

    if (eligible.length === 0) {
      return { entries: [] };
    }

    const lines: NewJournalLineInput[] = [];
    for (const { asset, amount } of eligible) {
      const description = `Depreciation - ${asset.assetNumber} (${periodEnd})`;
      lines.push({ accountId: asset.glDepreciationExpenseAccountId, description, debit: amount, credit: 0 });
      lines.push({ accountId: asset.glAccumulatedDepreciationAccountId, description, debit: 0, credit: amount });
    }

    const journalEntry = await this.journalPoster.postJournalEntry({
      date: periodEnd,
      source: 'depreciation',
      memo: `Depreciation run for period ending ${periodEnd}`,
      lines,
      postedByUserId,
    });

    const entries: DepreciationEntry[] = [];
    for (const { asset, amount } of eligible) {
      const accumulatedDepreciationAfter = asset.accumulatedDepreciation + amount;
      const depreciableBase = asset.cost - asset.residualValue;
      const newStatus: FixedAssetStatus =
        accumulatedDepreciationAfter >= depreciableBase - EPSILON ? 'fully_depreciated' : 'active';

      await this.assetStore.update(asset.id, {
        accumulatedDepreciation: accumulatedDepreciationAfter,
        status: newStatus,
      });

      const entry = await this.depreciationRepository.create({
        id: '',
        assetId: asset.id,
        periodEnd,
        amount,
        accumulatedDepreciationAfter,
        carryingValueAfter: asset.cost - accumulatedDepreciationAfter,
        journalEntryId: journalEntry.id,
        createdAt: '',
        updatedAt: '',
      });
      entries.push(entry);
    }

    return { entries, journalEntryId: journalEntry.id };
  }
}
