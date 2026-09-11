import type { AssetCategory, AuditAction, DepreciationMethod, EstimateRevision, FixedAsset, ID, JournalEntry } from '@/types';
import type { IFixedAssetRepository } from '../repositories/IFixedAssetRepository';
import type { IEstimateRevisionRepository } from '../repositories/IEstimateRevisionRepository';
import type { AccountMapper, NewJournalLineInput } from '@/features/accounting/services';
import type { EstimateRevisionExecutor } from './estimateRevisionExecutor';
import { addYears, estimateAsOf, isAfterDate, parseDateUTC, round2, startOfMonth } from './depreciationMath';
import { toEstimateTimeline } from './depreciationService';

/** Minimal read surface of the depreciation ledger — reviseEstimate checks that a revision's effective date does not fall on or before an already-posted period. */
export interface DepreciationHistoryReader {
  getByAsset(assetId: ID): Promise<{ periodEnd: string }[]>;
}

/**
 * Minimal surface of JournalEntryService this service depends on — an
 * interface, not the concrete class, mirroring billService.ts's
 * JournalPoster so this stays unit-testable with a stub.
 */
export interface JournalPoster {
  postJournalEntry(input: {
    date: string;
    memo?: string;
    source: string;
    lines: NewJournalLineInput[];
    postedByUserId?: ID;
  }): Promise<JournalEntry>;
}

/** Optional audit-trail collaborator — satisfied by the shared AuditLogService. */
export interface AssetAuditLogger {
  log(input: {
    userId: string;
    action: AuditAction;
    module: string;
    recordType: string;
    recordId: string;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }): Promise<unknown>;
}

export type CreateFixedAssetDTO = Omit<
  FixedAsset,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'accumulatedDepreciation'
  | 'status'
  | 'journalEntryId'
  | 'disposalDate'
  | 'disposalProceeds'
  | 'disposalJournalEntryId'
>;
export type UpdateFixedAssetDTO = Partial<CreateFixedAssetDTO>;

/**
 * Prospective change in accounting estimate (IAS 8.36 / IAS 16.51) — allowed
 * on a capitalized asset, unlike the hard-locked fields below. Persisted as
 * an effective-dated `EstimateRevision` (migration 0079), which is the
 * authoritative source the depreciation engine reconstructs the estimate
 * timeline from. Posted depreciation history is never touched.
 *
 * `effectiveDate` MUST be the first day of a month (estimate changes take
 * effect on an accounting-period boundary), and MUST be later than every
 * already-posted depreciation period. `usefulLifeYears` is the revised TOTAL
 * useful life measured from the acquisition date.
 */
export interface ReviseEstimateInput {
  /** First day of the month the revision takes effect (YYYY-MM-01). */
  effectiveDate: string;
  usefulLifeYears?: number;
  residualValue?: number;
  depreciationMethod?: DepreciationMethod;
  reducingBalanceRatePercent?: number;
  /** Free-text justification, recorded on the revision row and the audit trail. */
  reason?: string;
  postedByUserId?: string;
}

export interface CapitalizeFromBillLineInput {
  sourceBillId: ID;
  journalEntryId: ID;
  name: string;
  category: AssetCategory;
  acquisitionDate: string;
  cost: number;
  residualValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
  taxWearTearRatePercent?: number;
}

/** Shared economics validation for both createFixedAsset() and capitalizeFromBillLine(). */
function validateAssetEconomics(data: {
  cost: number;
  residualValue: number;
  usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  reducingBalanceRatePercent?: number;
}): void {
  if (data.cost <= 0) {
    throw new Error('Fixed asset cost must be greater than zero.');
  }
  if (data.residualValue < 0 || data.residualValue > data.cost) {
    throw new Error('Residual value must be between 0 and the asset cost.');
  }
  if (data.usefulLifeYears <= 0) {
    throw new Error('Useful life must be greater than zero years.');
  }
  if (data.depreciationMethod === 'reducing_balance' && data.reducingBalanceRatePercent === undefined) {
    throw new Error('Reducing-balance depreciation requires a reducingBalanceRatePercent.');
  }
}

/**
 * Fields that drive already-posted GL history once an asset leaves 'draft' —
 * an edit here would silently desync the register from what was posted.
 * Changing an *estimate* (useful life / residual / method) after
 * capitalisation is done through reviseEstimate(), which is prospective and
 * audited; only cost / dates / GL mappings are truly immutable.
 */
const LOCKED_AFTER_POST_FIELDS: (keyof UpdateFixedAssetDTO)[] = [
  'cost',
  'residualValue',
  'usefulLifeYears',
  'depreciationMethod',
  'reducingBalanceRatePercent',
  'acquisitionDate',
  'glAssetAccountId',
  'glAccumulatedDepreciationAccountId',
  'glDepreciationExpenseAccountId',
];

const MODULE = 'assets';
const RECORD_TYPE = 'FixedAsset';

/**
 * Business-logic layer for the Fixed Asset Register (SA_ACCOUNTING_MASTER_SPEC
 * §116 Phase 7). Create-draft-then-explicit-post lifecycle (like Bill /
 * Invoice), so a register entry can be reviewed before it becomes immutable
 * accounting history.
 */
export class FixedAssetService {
  constructor(
    private readonly repository: IFixedAssetRepository,
    private readonly journalPoster: JournalPoster,
    private readonly accounts: AccountMapper,
    private readonly estimateRevisions: IEstimateRevisionRepository,
    private readonly depreciationHistory: DepreciationHistoryReader,
    private readonly estimateRevisionExecutor: EstimateRevisionExecutor,
    private readonly auditLog?: AssetAuditLogger,
  ) {}

  private audit(
    action: AuditAction,
    recordId: ID,
    opts: { userId?: string; previousValue?: unknown; newValue?: unknown; reason?: string } = {},
  ): void {
    if (!this.auditLog) return;
    void this.auditLog
      .log({
        userId: opts.userId || 'system',
        action,
        module: MODULE,
        recordType: RECORD_TYPE,
        recordId,
        previousValue: opts.previousValue,
        newValue: opts.newValue,
        reason: opts.reason,
      })
      .catch(() => {
        /* audit logging is best-effort — never block a posting on it */
      });
  }

  async getFixedAssets(): Promise<FixedAsset[]> {
    return this.repository.getAll();
  }

  async getFixedAsset(id: ID): Promise<FixedAsset | undefined> {
    return this.repository.getById(id);
  }

  async createFixedAsset(data: CreateFixedAssetDTO): Promise<FixedAsset> {
    validateAssetEconomics(data);

    const now = new Date().toISOString();
    const created = await this.repository.create({
      ...data,
      id: '',
      accumulatedDepreciation: 0,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    this.audit('created', created.id, { newValue: { assetNumber: created.assetNumber, cost: created.cost } });
    return created;
  }

  async updateFixedAsset(id: ID, patch: UpdateFixedAssetDTO): Promise<FixedAsset> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error(`Fixed asset "${id}" not found.`);
    }
    if (asset.status !== 'draft') {
      const lockedFieldTouched = LOCKED_AFTER_POST_FIELDS.some((field) => field in patch);
      if (lockedFieldTouched) {
        throw new Error(
          `Cannot change cost / acquisition-date / GL-mapping fields on "${asset.assetNumber}": it has already been capitalized (status: ${asset.status}). Use "Revise estimate" for a prospective change to useful life, residual value or method.`,
        );
      }
    }
    const updated = await this.repository.update(id, patch);
    this.audit('edited', id, { previousValue: asset, newValue: updated });
    return updated;
  }

  /**
   * Permanently removes a draft asset. Anything past 'draft' has real posted
   * GL history behind it and must never be deleted.
   */
  async deleteFixedAsset(id: ID): Promise<void> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error(`Fixed asset "${id}" not found.`);
    }
    if (asset.status !== 'draft') {
      throw new Error(
        `Cannot delete "${asset.assetNumber}": only a draft (not yet capitalized) asset can be deleted (current status: ${asset.status}).`,
      );
    }
    await this.repository.delete(id);
    this.audit('deleted', id, { previousValue: { assetNumber: asset.assetNumber } });
  }

  /** Every estimate revision ever recorded for an asset, oldest first. */
  async getEstimateRevisions(assetId: ID): Promise<EstimateRevision[]> {
    return this.estimateRevisions.getByAsset(assetId);
  }

  /**
   * Prospective change in estimate (IAS 8.36 / IAS 16.51). Persists an
   * effective-dated `EstimateRevision` — the authoritative record the
   * depreciation engine uses to decide which estimate governed each
   * historical period. Posted depreciation is never rewritten; the next
   * run re-spreads the remaining amount over the revised remaining life
   * from `effectiveDate` onward.
   *
   * Rules enforced here (docs/FIXED_ASSETS.md):
   *  - the asset must be capitalized and still on the books;
   *  - `effectiveDate` must be the first day of a month (period boundary);
   *  - `effectiveDate` must be later than every already-posted depreciation
   *    period — a revision can never re-rate history;
   *  - revised total useful life > 0 and later than the effective date;
   *  - residual between 0 and the current carrying value;
   *  - reducing balance needs an annual rate.
   *
   * The `fixed_assets` estimate columns are refreshed to whatever estimate
   * is in effect *today* (a denormalised cache for read-side / UI /
   * integrity); they are never the source for a historical period once a
   * revision exists.
   */
  async reviseEstimate(id: ID, input: ReviseEstimateInput): Promise<FixedAsset> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error(`Fixed asset "${id}" not found.`);
    }
    if (asset.status !== 'active' && asset.status !== 'fully_depreciated') {
      throw new Error(
        `Cannot revise "${asset.assetNumber}": estimates can only be revised on a capitalized asset that is still on the books (current status: ${asset.status}).`,
      );
    }

    const effectiveDate = input.effectiveDate?.slice(0, 10);
    if (!effectiveDate || Number.isNaN(parseDateUTC(effectiveDate))) {
      throw new Error('A revision needs a valid effective date.');
    }
    if (startOfMonth(effectiveDate) !== effectiveDate) {
      throw new Error(
        `Estimate revisions take effect on an accounting-period boundary — the effective date must be the first day of a month (got ${effectiveDate}).`,
      );
    }
    if (isAfterDate(asset.acquisitionDate, effectiveDate)) {
      throw new Error('A revision cannot take effect before the asset was acquired.');
    }

    // Must not re-rate an already-posted period.
    const posted = await this.depreciationHistory.getByAsset(id);
    const latestPostedMonth = posted.reduce((max, e) => (e.periodEnd > max ? e.periodEnd : max), '');
    if (latestPostedMonth && parseDateUTC(effectiveDate) <= parseDateUTC(startOfMonth(latestPostedMonth))) {
      throw new Error(
        `Cannot revise "${asset.assetNumber}" from ${effectiveDate}: depreciation is already posted up to ${latestPostedMonth.slice(0, 10)}. ` +
          `A revision must take effect from a month after the last posted period.`,
      );
    }

    // The estimate that applied immediately before this revision — resolved from
    // the existing timeline as of the new effective date, never assumed to be
    // "the current asset columns".
    const existing = await this.estimateRevisions.getByAsset(id);
    const { baseline, snapshots } = toEstimateTimeline(asset, existing);
    const prior = estimateAsOf(
      { effectiveDate: asset.acquisitionDate.slice(0, 10), ...baseline },
      snapshots,
      effectiveDate,
    );

    const next = {
      usefulLifeYears: input.usefulLifeYears ?? prior.usefulLifeYears,
      residualValue: input.residualValue ?? prior.residualValue,
      depreciationMethod: input.depreciationMethod ?? prior.depreciationMethod,
      reducingBalanceRatePercent: input.reducingBalanceRatePercent ?? prior.reducingBalanceRatePercent,
    };

    if (next.usefulLifeYears <= 0) {
      throw new Error('Revised useful life must be greater than zero years.');
    }
    if (!isAfterDate(addYears(asset.acquisitionDate, next.usefulLifeYears), effectiveDate)) {
      throw new Error('Revised useful life leaves no remaining life on or after the effective date.');
    }
    const carryingValue = round2(asset.cost - asset.accumulatedDepreciation);
    if (next.residualValue < 0 || next.residualValue > carryingValue + 0.005) {
      throw new Error(
        `Revised residual value must be between 0 and the current carrying value (${carryingValue.toFixed(2)}).`,
      );
    }
    if (next.depreciationMethod === 'reducing_balance' && next.reducingBalanceRatePercent === undefined) {
      throw new Error('Reducing-balance depreciation requires an annual rate.');
    }

    // ONE atomic command (revise_fixed_asset_estimate, migration 0084): the
    // fixed_asset_estimate_revisions insert and the fixed_assets "current
    // estimate" cache resync commit together, or neither does — the cache
    // can no longer diverge from the revision table because of a partial
    // write (docs/FIXED_ASSETS.md "Estimate revision atomicity"). The cache
    // is refreshed to whichever revision now has the latest effective_date,
    // never assumed to be this one (a later-effective revision may already
    // exist and must keep winning).
    await this.estimateRevisionExecutor.postRevision({
      assetId: id,
      effectiveDate,
      usefulLifeYears: next.usefulLifeYears,
      residualValue: next.residualValue,
      depreciationMethod: next.depreciationMethod,
      reducingBalanceRatePercent: next.reducingBalanceRatePercent,
      previousUsefulLifeYears: prior.usefulLifeYears,
      previousResidualValue: prior.residualValue,
      previousDepreciationMethod: prior.depreciationMethod,
      previousReducingBalanceRatePercent: prior.reducingBalanceRatePercent,
      reason: input.reason,
      createdBy: input.postedByUserId,
    });

    const updated = await this.repository.getById(id);
    if (!updated) {
      throw new Error(`Fixed asset "${id}" not found after revising its estimate.`);
    }
    this.audit('edited', id, {
      userId: input.postedByUserId,
      reason: input.reason ?? 'Change in accounting estimate',
      previousValue: {
        effectiveDate,
        usefulLifeYears: prior.usefulLifeYears,
        residualValue: prior.residualValue,
        depreciationMethod: prior.depreciationMethod,
        reducingBalanceRatePercent: prior.reducingBalanceRatePercent,
      },
      newValue: next,
    });
    return updated;
  }

  /**
   * Capitalizes a draft asset: DR Fixed Asset / CR contraAccountId for the
   * full cost, flips to 'active', records the journal entry id. Only a
   * 'draft' asset may be posted, so an asset can never be capitalized twice.
   */
  async postAcquisition(id: ID, contraAccountId: ID, postedByUserId?: ID): Promise<FixedAsset> {
    const asset = await this.repository.getById(id);
    if (!asset) {
      throw new Error(`Fixed asset "${id}" not found.`);
    }
    if (asset.status !== 'draft') {
      throw new Error(`Fixed asset "${asset.assetNumber}" has already been capitalized (status: ${asset.status}).`);
    }

    const lines: NewJournalLineInput[] = [
      {
        accountId: asset.glAssetAccountId,
        description: `Capitalize ${asset.assetNumber} - ${asset.name}`,
        debit: asset.cost,
        credit: 0,
      },
      {
        accountId: contraAccountId,
        description: `Capitalize ${asset.assetNumber} - ${asset.name}`,
        debit: 0,
        credit: asset.cost,
      },
    ];

    const entry = await this.journalPoster.postJournalEntry({
      date: asset.acquisitionDate,
      memo: `Capitalize ${asset.assetNumber} - ${asset.name}`,
      source: 'fixed_asset_acquisition',
      lines,
      postedByUserId,
    });

    const updated = await this.repository.update(id, { status: 'active', journalEntryId: entry.id });
    this.audit('posted', id, { userId: postedByUserId, newValue: { journalEntryId: entry.id, cost: asset.cost } });
    return updated;
  }

  /**
   * Capitalizes a Bill line flagged as a fixed asset directly to 'active' —
   * the Bill's own posting IS the capitalization event, so this only writes
   * the register row pointing at that already-posted entry.
   */
  async capitalizeFromBillLine(input: CapitalizeFromBillLineInput): Promise<FixedAsset> {
    validateAssetEconomics(input);

    const assetNumber = await this.nextAssetNumber();
    const [glAssetAccountId, glAccumulatedDepreciationAccountId, glDepreciationExpenseAccountId] = await Promise.all([
      this.accounts.getAccountId('FIXED_ASSET'),
      this.accounts.getAccountId('ACCUMULATED_DEPRECIATION'),
      this.accounts.getAccountId('DEPRECIATION_EXPENSE'),
    ]);
    const now = new Date().toISOString();
    const created = await this.repository.create({
      id: '',
      assetNumber,
      name: input.name,
      category: input.category,
      acquisitionDate: input.acquisitionDate,
      cost: input.cost,
      residualValue: input.residualValue,
      usefulLifeYears: input.usefulLifeYears,
      depreciationMethod: input.depreciationMethod,
      reducingBalanceRatePercent: input.reducingBalanceRatePercent,
      taxWearTearRatePercent: input.taxWearTearRatePercent,
      glAssetAccountId,
      glAccumulatedDepreciationAccountId,
      glDepreciationExpenseAccountId,
      accumulatedDepreciation: 0,
      status: 'active',
      journalEntryId: input.journalEntryId,
      sourceBillId: input.sourceBillId,
      createdAt: now,
      updatedAt: now,
    });
    this.audit('created', created.id, {
      newValue: { assetNumber, sourceBillId: input.sourceBillId, cost: input.cost },
      reason: 'Capitalized from supplier invoice line',
    });
    return created;
  }

  /** Sequential document number based on register size. */
  private async nextAssetNumber(): Promise<string> {
    const assets = await this.repository.getAll();
    return `FA-${String(assets.length + 1).padStart(4, '0')}`;
  }
}
