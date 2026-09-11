import type { AccountingPeriod, DepreciationEntry, EstimateRevision, FixedAsset, FixedAssetStatus, ID } from '@/types';
import type { IDepreciationEntryRepository } from '../repositories/IDepreciationEntryRepository';
import type { DepreciationPeriodExecutor, DepreciationPeriodLineInput } from './depreciationPeriodExecutor';
import { newUuid } from '@/lib/uuid';
import { findPeriodForDate } from '@/features/accounting/utils/periodLookup';
import {
  EPSILON,
  planAssetDepreciation,
  round2,
  startOfMonth,
  type AssetDepreciationInput,
  type AssetDepreciationPlan,
  type EstimateRevisionSnapshot,
  type PlannedDepreciationPeriod,
} from './depreciationMath';

/** Reconstructs the estimate the planner should treat as the baseline (effective from acquisition) + the effective-dated timeline. */
export function toEstimateTimeline(
  asset: Pick<FixedAsset, 'usefulLifeYears' | 'residualValue' | 'depreciationMethod' | 'reducingBalanceRatePercent' | 'acquisitionDate'>,
  revisions: readonly EstimateRevision[],
): { baseline: Pick<AssetDepreciationInput, 'usefulLifeYears' | 'residualValue' | 'depreciationMethod' | 'reducingBalanceRatePercent'>; snapshots: EstimateRevisionSnapshot[] } {
  const ordered = [...revisions].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  // Once any revision exists, the pre-first-revision baseline is that revision's
  // recorded `previous*` snapshot — never the (mutable) current asset columns.
  const baseline = ordered.length
    ? {
        usefulLifeYears: ordered[0].previousUsefulLifeYears,
        residualValue: ordered[0].previousResidualValue,
        depreciationMethod: ordered[0].previousDepreciationMethod,
        reducingBalanceRatePercent: ordered[0].previousReducingBalanceRatePercent,
      }
    : {
        usefulLifeYears: asset.usefulLifeYears,
        residualValue: asset.residualValue,
        depreciationMethod: asset.depreciationMethod,
        reducingBalanceRatePercent: asset.reducingBalanceRatePercent,
      };
  const snapshots: EstimateRevisionSnapshot[] = ordered.map((r) => ({
    effectiveDate: r.effectiveDate.slice(0, 10),
    usefulLifeYears: r.usefulLifeYears,
    residualValue: r.residualValue,
    depreciationMethod: r.depreciationMethod,
    reducingBalanceRatePercent: r.reducingBalanceRatePercent,
  }));
  return { baseline, snapshots };
}

/** Minimal surface of FixedAssetRepository this service depends on. */
export interface AssetStore {
  getAll(): Promise<FixedAsset[]>;
  getById(id: ID): Promise<FixedAsset | undefined>;
  update(id: ID, patch: Partial<FixedAsset>): Promise<FixedAsset>;
}

/** Minimal surface of the accounting-period repository this service needs — just the list, to classify each catch-up month as open or blocked BEFORE anything posts. */
export interface PeriodResolver {
  getAll(): Promise<AccountingPeriod[]>;
}

/** Minimal surface of the estimate-revision repository — the effective-dated estimate timeline for an asset (migration 0079). */
export interface RevisionResolver {
  getByAsset(assetId: ID): Promise<EstimateRevision[]>;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "June 2026" from any ISO date in that month. */
function monthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export type DepreciationPeriodStatus = 'ready' | 'blocked';

/**
 * One accounting-period bucket of a catch-up run. `runDepreciation` posts
 * exactly one journal entry per `ready` bucket, dated in that bucket's own
 * month — never rolled forward into the run's target month.
 */
export interface DepreciationPeriodGroup {
  /** Posting date for this bucket's journal — the month-end, or the run's target date for a final clipped month. */
  periodEnd: string;
  /** e.g. "June 2026". */
  label: string;
  status: DepreciationPeriodStatus;
  /** Present only when `status === 'blocked'`. */
  blockedReason?: string;
  /** Assets that have a charge in this bucket (posted if ready, held back if blocked). */
  assetCount: number;
  /** Total depreciation charge in this bucket. */
  amount: number;
}

export interface DepreciationRunResult {
  entries: DepreciationEntry[];
  /** One journal entry id per posted accounting period, oldest first. Empty when nothing was eligible. */
  journalEntryIds: ID[];
  /** Accounting periods that were NOT posted because the period is closed/locked or an earlier period is. */
  blockedPeriods: DepreciationPeriodGroup[];
}

export interface DepreciationPreviewRow {
  assetId: ID;
  assetNumber: string;
  name: string;
  /** Months (period-end dates) that will be posted for this asset in the run. */
  periods: { periodEnd: string; amount: number }[];
  /** Total charge across every postable period for this asset. */
  amount: number;
  /** Charge held back because it falls in (or after) a blocked period. */
  blockedAmount: number;
  carryingValueBefore: number;
  carryingValueAfter: number;
}

export interface DepreciationPreview {
  targetDate: string;
  /** One row per accounting period the run touches — ready and blocked, oldest first. Drives the run dialog's period-by-period table. */
  periods: DepreciationPeriodGroup[];
  rows: DepreciationPreviewRow[];
  /** Total that will actually post (ready periods only). */
  totalCharge: number;
  /** Total debit = total credit = totalCharge across all ready periods. */
  totalDebit: number;
  totalCredit: number;
  /** Total charge sitting behind a blocked period. */
  blockedTotal: number;
  hasBlockedPeriods: boolean;
}

/**
 * A nominal single full-month charge for an asset — the figure the Register
 * / detail workspace shows as "current-period depreciation". NOT the posting
 * path (that is `runDepreciation`, which is day-count prorated and catches up
 * missed months). Kept deliberately simple and side-effect-free.
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

function toPlanInput(asset: FixedAsset): AssetDepreciationInput {
  return {
    id: asset.id,
    assetNumber: asset.assetNumber,
    cost: asset.cost,
    residualValue: asset.residualValue,
    usefulLifeYears: asset.usefulLifeYears,
    depreciationMethod: asset.depreciationMethod,
    reducingBalanceRatePercent: asset.reducingBalanceRatePercent,
    acquisitionDate: asset.acquisitionDate,
    accumulatedDepreciation: asset.accumulatedDepreciation,
  };
}

/** A single asset's plan, split into what can post now and what is behind a locked period. */
interface AssetRunPlan {
  assetId: ID;
  assetNumber: string;
  name: string;
  ready: PlannedDepreciationPeriod[];
  blocked: PlannedDepreciationPeriod[];
  carryingValueBefore: number;
}

interface RunPlan {
  perAsset: AssetRunPlan[];
  /** Every distinct accounting-period bucket the run touches, oldest first. */
  groups: DepreciationPeriodGroup[];
}

/**
 * The depreciation engine (SA_ACCOUNTING_MASTER_SPEC §116 Phase 7).
 *
 * `runDepreciation(date)` catches up every unposted month between each
 * asset's last posting (or acquisition) and `date`, but posts **one journal
 * entry per calendar month, dated in that month** — June depreciation lands
 * in a June-dated journal, July in July, and so on. Multiple assets sharing
 * a month are combined into that month's single entry (DR Depreciation
 * Expense / CR Accumulated Depreciation per asset). Depreciation belonging
 * to different accounting periods is never collapsed into the run's target
 * month, so monthly GL / Income Statement figures stay correct.
 *
 * Each month is classified against the accounting-period calendar first. If
 * a month's period is closed or locked, that month — and every later month
 * for the same asset — is held back (posting a later month while an earlier
 * one is blocked would make the asset's accumulated-depreciation history
 * non-reconstructable). The blocked months are returned, never forced
 * through and never silently skipped.
 *
 * Each month is also computed on the estimate that governed it: the asset's
 * effective-dated estimate timeline (`fixed_asset_estimate_revisions`,
 * migration 0079) is loaded per asset and passed to `planAssetDepreciation`,
 * so a catch-up run spanning a revision uses the old estimate for
 * pre-effective-date months and the new one afterwards (see
 * `toEstimateTimeline` and docs/FIXED_ASSETS.md § Estimate precedence).
 *
 * `previewDepreciation(date)` runs the identical classification with no side
 * effects — the run dialog shows each period bucket as Ready or Blocked
 * before anything posts.
 *
 * Posting itself goes through `periodExecutor` — one atomic
 * `post_asset_depreciation_period` RPC call per ready month (migration
 * 0081), not a journal-post-then-loop-of-separate-writes. A failure
 * partway through a month rolls that whole month back; earlier months
 * already committed by an earlier call in the same run stay posted, exactly
 * matching "one period = one atomic command" (docs/FIXED_ASSETS.md).
 */
export class DepreciationService {
  constructor(
    private readonly depreciationRepository: IDepreciationEntryRepository,
    private readonly assetStore: AssetStore,
    private readonly periodExecutor: DepreciationPeriodExecutor,
    private readonly periodResolver: PeriodResolver,
    private readonly revisionResolver: RevisionResolver,
  ) {}

  async getDepreciationHistory(assetId?: ID): Promise<DepreciationEntry[]> {
    if (assetId) return this.depreciationRepository.getByAsset(assetId);
    return this.depreciationRepository.getAll();
  }

  /**
   * Classifies a calendar month (identified by any date inside it) as open
   * or blocked for posting, with a human reason when blocked.
   */
  private classifyMonth(
    periods: AccountingPeriod[],
    periodEnd: string,
  ): { blocked: boolean; reason?: string } {
    const period = findPeriodForDate(periods, periodEnd);
    if (!period) {
      return { blocked: true, reason: `No accounting period is defined for ${monthLabel(periodEnd)}.` };
    }
    if (period.status !== 'open') {
      return { blocked: true, reason: `Accounting period "${period.name}" is ${period.status}, not open.` };
    }
    return { blocked: false };
  }

  private async buildRunPlan(assets: FixedAsset[], targetDate: string): Promise<RunPlan> {
    const periods = await this.periodResolver.getAll();
    const active = assets.filter((a) => a.status === 'active');

    // Per-asset month-by-month charges (day-count prorated, catch-up aware).
    const plans: { asset: FixedAsset; plan: AssetDepreciationPlan }[] = [];
    for (const asset of active) {
      const [history, revisions] = await Promise.all([
        this.depreciationRepository.getByAsset(asset.id),
        this.revisionResolver.getByAsset(asset.id),
      ]);
      const { baseline, snapshots } = toEstimateTimeline(asset, revisions);
      const plan = planAssetDepreciation(
        { ...toPlanInput(asset), ...baseline },
        history.map((e) => e.periodEnd),
        targetDate,
        snapshots,
      );
      if (plan.periods.length > 0) plans.push({ asset, plan });
    }

    // Distinct months across every asset, oldest first, each classified once.
    const monthMeta = new Map<string, { periodEnd: string; blocked: boolean; reason?: string }>();
    for (const { plan } of plans) {
      for (const p of plan.periods) {
        const key = startOfMonth(p.periodEnd);
        const existing = monthMeta.get(key);
        // Keep the latest periodEnd for the bucket (a final clipped month uses the target date).
        if (!existing || p.periodEnd > existing.periodEnd) {
          const { blocked, reason } = existing ?? this.classifyMonth(periods, p.periodEnd);
          monthMeta.set(key, { periodEnd: p.periodEnd, blocked, reason });
        }
      }
    }
    const monthKeys = [...monthMeta.keys()].sort();
    const firstBlockedKey = monthKeys.find((k) => monthMeta.get(k)!.blocked);

    // Split every asset's periods at the first blocked month (its own or an earlier one).
    const perAsset: AssetRunPlan[] = plans.map(({ asset, plan }) => {
      const ready: PlannedDepreciationPeriod[] = [];
      const blocked: PlannedDepreciationPeriod[] = [];
      for (const p of plan.periods) {
        const key = startOfMonth(p.periodEnd);
        const isBlocked = firstBlockedKey !== undefined && key >= firstBlockedKey;
        (isBlocked ? blocked : ready).push(p);
      }
      return {
        assetId: asset.id,
        assetNumber: asset.assetNumber,
        name: asset.name,
        ready,
        blocked,
        carryingValueBefore: round2(asset.cost - asset.accumulatedDepreciation),
      };
    });

    const groups: DepreciationPeriodGroup[] = monthKeys.map((key) => {
      const meta = monthMeta.get(key)!;
      const blockedGroup = firstBlockedKey !== undefined && key >= firstBlockedKey;
      const contributing = perAsset.filter((a) =>
        (blockedGroup ? a.blocked : a.ready).some((p) => startOfMonth(p.periodEnd) === key),
      );
      const amount = round2(
        contributing.reduce(
          (s, a) => s + (blockedGroup ? a.blocked : a.ready).filter((p) => startOfMonth(p.periodEnd) === key).reduce((t, p) => t + p.amount, 0),
          0,
        ),
      );
      let blockedReason: string | undefined;
      if (blockedGroup) {
        blockedReason = meta.blocked
          ? meta.reason
          : `An earlier period (${monthLabel(monthMeta.get(firstBlockedKey!)!.periodEnd)}) is not open, so this period is held back too.`;
      }
      return {
        periodEnd: meta.periodEnd,
        label: monthLabel(meta.periodEnd),
        status: blockedGroup ? 'blocked' : 'ready',
        blockedReason,
        assetCount: contributing.length,
        amount,
      };
    });

    return { perAsset, groups };
  }

  async previewDepreciation(targetDate: string): Promise<DepreciationPreview> {
    const assets = await this.assetStore.getAll();
    const { perAsset, groups } = await this.buildRunPlan(assets, targetDate);

    const rows: DepreciationPreviewRow[] = perAsset.map((a) => {
      const amount = round2(a.ready.reduce((s, p) => s + p.amount, 0));
      const blockedAmount = round2(a.blocked.reduce((s, p) => s + p.amount, 0));
      return {
        assetId: a.assetId,
        assetNumber: a.assetNumber,
        name: a.name,
        periods: a.ready.map((p) => ({ periodEnd: p.periodEnd, amount: p.amount })),
        amount,
        blockedAmount,
        carryingValueBefore: a.carryingValueBefore,
        carryingValueAfter: round2(a.carryingValueBefore - amount),
      };
    });

    const totalCharge = round2(groups.filter((g) => g.status === 'ready').reduce((s, g) => s + g.amount, 0));
    const blockedTotal = round2(groups.filter((g) => g.status === 'blocked').reduce((s, g) => s + g.amount, 0));
    return {
      targetDate,
      periods: groups,
      rows,
      totalCharge,
      totalDebit: totalCharge,
      totalCredit: totalCharge,
      blockedTotal,
      hasBlockedPeriods: blockedTotal > EPSILON || groups.some((g) => g.status === 'blocked'),
    };
  }

  /**
   * Posts depreciation for every 'active' asset up to `periodEnd`, catching
   * up any unposted months as one journal entry per month. Assets not yet
   * available for use, already current, or fully depreciated are silently
   * skipped. Months in a closed/locked accounting period (and every later
   * month for that asset) are returned in `blockedPeriods`, not posted.
   */
  async runDepreciation(periodEnd: string, postedByUserId?: ID): Promise<DepreciationRunResult> {
    const assets = await this.assetStore.getAll();
    const plan = await this.buildRunPlan(assets, periodEnd);
    return this.postPlan(plan, `Depreciation`, postedByUserId);
  }

  /**
   * Depreciates a single asset up to `throughDate` (used by
   * AssetDisposalService to bring an asset current to its disposal date
   * before derecognition). Throws if any month up to `throughDate` falls in
   * a closed/locked period — the asset cannot be disposed on a stale
   * carrying value, and the missed depreciation must be posted to its own
   * period first.
   */
  async catchUpToDate(assetId: ID, throughDate: string, postedByUserId?: ID): Promise<DepreciationRunResult> {
    const asset = await this.assetStore.getById(assetId);
    if (!asset || asset.status !== 'active') return { entries: [], journalEntryIds: [], blockedPeriods: [] };
    const plan = await this.buildRunPlan([asset], throughDate);
    const blocked = plan.groups.filter((g) => g.status === 'blocked');
    if (blocked.length > 0) {
      throw new Error(
        `Cannot bring ${asset.assetNumber} current to ${throughDate.slice(0, 10)}: ${blocked[0].blockedReason} ` +
          `Post depreciation for that period once it is open (or dispose at an earlier date) before disposing this asset.`,
      );
    }
    return this.postPlan(plan, `Depreciation of ${asset.assetNumber}`, postedByUserId);
  }

  private async postPlan(plan: RunPlan, memoPrefix: string, postedByUserId?: ID): Promise<DepreciationRunResult> {
    const readyGroups = plan.groups.filter((g) => g.status === 'ready');
    const blockedPeriods = plan.groups.filter((g) => g.status === 'blocked');
    if (readyGroups.length === 0) {
      return { entries: [], journalEntryIds: [], blockedPeriods };
    }

    const assetRecords = new Map<ID, FixedAsset>();
    for (const a of plan.perAsset) {
      const rec = await this.assetStore.getById(a.assetId);
      if (rec) assetRecords.set(a.assetId, rec);
    }

    const entries: DepreciationEntry[] = [];
    const journalEntryIds: ID[] = [];

    // One atomic post_asset_depreciation_period call per ready month, in
    // chronological order — "one period = one atomic command = one
    // depreciation journal" (docs/FIXED_ASSETS.md). A failure partway
    // through a month's RPC call rolls back only that month; the months
    // already posted by earlier calls in this loop stay posted, matching
    // this schema's accounting-period boundaries.
    for (const group of readyGroups) {
      const key = startOfMonth(group.periodEnd);
      const contributions: { plan: AssetRunPlan; period: PlannedDepreciationPeriod }[] = [];
      for (const a of plan.perAsset) {
        const period = a.ready.find((p) => startOfMonth(p.periodEnd) === key);
        if (period) contributions.push({ plan: a, period });
      }
      if (contributions.length === 0) continue;

      const lines: DepreciationPeriodLineInput[] = contributions.map(({ plan: a, period }) => {
        const asset = assetRecords.get(a.assetId)!;
        const base = asset.cost - asset.residualValue;
        const newStatus: FixedAssetStatus = period.accumulatedDepreciationAfter >= base - EPSILON ? 'fully_depreciated' : 'active';
        return {
          assetId: a.assetId,
          amount: period.amount,
          accumulatedDepreciationAfter: period.accumulatedDepreciationAfter,
          carryingValueAfter: period.carryingValueAfter,
          newStatus,
          glDepreciationExpenseAccountId: asset.glDepreciationExpenseAccountId,
          glAccumulatedDepreciationAccountId: asset.glAccumulatedDepreciationAccountId,
          description: `Depreciation - ${a.assetNumber} (${period.periodEnd})`,
        };
      });

      const result = await this.periodExecutor.postPeriod({
        runId: newUuid(),
        periodEnd: group.periodEnd,
        memo: `${memoPrefix} - ${group.label}`,
        source: 'depreciation',
        lines,
        createdBy: postedByUserId,
      });
      journalEntryIds.push(result.journalEntryId);
      entries.push(...result.entries);
    }

    return { entries, journalEntryIds, blockedPeriods };
  }
}
