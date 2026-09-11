import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetDisposal, EstimateRevision, FixedAssetStatus, ID, VatDirection, VatSourceEntry, VatTreatment } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "dispose this fixed asset" operation.
 *
 * The real executor is the atomic Postgres RPC `post_fixed_asset_disposal`
 * (migration 0083): one implicit transaction that posts the disposal
 * journal, writes the `asset_disposals` evidence row, flips the asset to
 * 'disposed', and (for a taxable disposal) writes the `vat_source_entries`
 * evidence row — all or nothing. `RealDisposalExecutor` calls it;
 * `FakeDisposalExecutor` mirrors its exact contract over the in-memory
 * mocks for tests. Same Real/Fake split as `DepositAllocationExecutor`.
 */
export interface PostDisposalVatInput {
  taxRateId: ID;
  treatment: VatTreatment;
  direction: VatDirection;
  taxableAmount: number;
  vatAmount: number;
  grossAmount: number;
  classification?: string;
  reason?: string;
}

export interface PostDisposalInput {
  /**
   * Stable, immutable identity of this logical disposal — a UUID generated
   * client-side BEFORE the RPC runs. A retry of the same intent re-uses it.
   * De-duplicated by `fixed_asset_disposal_log`'s UNIQUE (company_id, disposal_id).
   */
  disposalId: ID;
  assetId: ID;
  disposalDate: string;
  memo: string;
  source: string;
  /** The disposal journal's lines — already fully computed by assetDisposalService. */
  lines: NewJournalLineInput[];
  proceeds: number;
  carryingValue: number;
  accumulatedDepreciation: number;
  gainLoss: number;
  /** Undefined for an out-of-scope disposal. */
  vat?: PostDisposalVatInput;
  createdBy?: ID;
}

export interface PostDisposalResult {
  idempotent: boolean;
  disposal: AssetDisposal;
  journalEntryId: ID;
  vatSourceEntryId?: ID;
}

export interface DisposalExecutor {
  postDisposal(input: PostDisposalInput): Promise<PostDisposalResult>;
}

interface AssetDisposalRow {
  id: string;
  asset_id: string;
  disposal_date: string;
  proceeds: number | string;
  carrying_value_at_disposal: number | string;
  accumulated_depreciation_at_disposal: number | string;
  gain_loss: number | string;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
}

function rowToDisposal(row: AssetDisposalRow): AssetDisposal {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assetId: row.asset_id,
    disposalDate: row.disposal_date,
    proceeds: Number(row.proceeds),
    carryingValueAtDisposal: Number(row.carrying_value_at_disposal),
    accumulatedDepreciationAtDisposal: Number(row.accumulated_depreciation_at_disposal),
    gainLoss: Number(row.gain_loss),
    journalEntryId: row.journal_entry_id,
  };
}

/** Production: the atomic `post_fixed_asset_disposal` RPC (migration 0083). */
export class RealDisposalExecutor implements DisposalExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postDisposal(input: PostDisposalInput): Promise<PostDisposalResult> {
    const { data, error } = await this.client.rpc('post_fixed_asset_disposal', {
      p_disposal_id: input.disposalId,
      p_asset_id: input.assetId,
      p_disposal_date: input.disposalDate,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: input.lines.map((line) => ({
        account_id: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
      p_proceeds: input.proceeds,
      p_carrying_value: input.carryingValue,
      p_accumulated_depreciation: input.accumulatedDepreciation,
      p_gain_loss: input.gainLoss,
      p_vat: input.vat
        ? {
            tax_rate_id: input.vat.taxRateId,
            treatment: input.vat.treatment,
            direction: input.vat.direction,
            taxable_amount: input.vat.taxableAmount,
            vat_amount: input.vat.vatAmount,
            gross_amount: input.vat.grossAmount,
            classification: input.vat.classification ?? null,
            reason: input.vat.reason ?? null,
          }
        : null,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`post_fixed_asset_disposal: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string; disposal: AssetDisposalRow; vat_source_entry_id: string | null };
    return {
      idempotent: row.idempotent,
      journalEntryId: row.journal_entry_id,
      disposal: rowToDisposal(row.disposal),
      vatSourceEntryId: row.vat_source_entry_id ?? undefined,
    };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeDisposalExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  assets: {
    getById(id: ID): Promise<{ status: FixedAssetStatus } | undefined>;
    update(id: ID, patch: Record<string, unknown>): Promise<unknown>;
  };
  disposals: {
    create(entity: Omit<AssetDisposal, 'id' | 'createdAt' | 'updatedAt'> & { id: ''; createdAt: ''; updatedAt: '' }): Promise<AssetDisposal>;
  };
  vatSourceEntries?: {
    create(entity: Omit<VatSourceEntry, 'id' | 'createdAt' | 'updatedAt'> & { id: ''; createdAt: ''; updatedAt: '' }): Promise<{ id: ID }>;
  };
  /** Only needed to emulate the future-revision disposal guard (Review 4 Item L). */
  estimateRevisions?: {
    getByAsset(assetId: ID): Promise<EstimateRevision[]>;
  };
  /** Same "prove all-or-nothing" hook as FakeDepreciationPeriodExecutor. */
  beforeCommit?: () => void | Promise<void>;
}

/**
 * Test double. Mirrors `post_fixed_asset_disposal` step for step —
 * including de-duplication on the stable `disposalId`, the draft/disposed
 * re-validation, and the future-estimate-revision guard — so
 * AssetDisposalService tests exercise the same observable contract the
 * production RPC provides.
 */
export class FakeDisposalExecutor implements DisposalExecutor {
  private readonly log = new Map<ID, PostDisposalResult>();
  private readonly disposedAssets = new Set<ID>();

  constructor(private readonly deps: FakeDisposalExecutorDeps) {}

  async postDisposal(input: PostDisposalInput): Promise<PostDisposalResult> {
    const seen = this.log.get(input.disposalId);
    if (seen) return { ...seen, idempotent: true };

    const asset = await this.deps.assets.getById(input.assetId);
    if (!asset) throw new Error(`post_fixed_asset_disposal: asset ${input.assetId} not found in company`);
    if (asset.status === 'draft') {
      throw new Error(`post_fixed_asset_disposal: asset ${input.assetId} has not been capitalized yet (still a draft)`);
    }
    if (asset.status === 'disposed' || this.disposedAssets.has(input.assetId)) {
      throw new Error(`post_fixed_asset_disposal: asset ${input.assetId} has already been disposed`);
    }

    if (this.deps.estimateRevisions) {
      const revisions = await this.deps.estimateRevisions.getByAsset(input.assetId);
      const future = revisions.find((r) => r.effectiveDate > input.disposalDate);
      if (future) {
        throw new Error(
          `post_fixed_asset_disposal: asset ${input.assetId} has an estimate revision effective ${future.effectiveDate} — correct or account for that revision before disposing this asset`,
        );
      }
    }

    await this.deps.beforeCommit?.();

    const entry = await this.deps.journal.postJournalEntry({ date: input.disposalDate, memo: input.memo, source: input.source, lines: input.lines });

    const disposal = await this.deps.disposals.create({
      id: '',
      assetId: input.assetId,
      disposalDate: input.disposalDate,
      proceeds: input.proceeds,
      carryingValueAtDisposal: input.carryingValue,
      accumulatedDepreciationAtDisposal: input.accumulatedDepreciation,
      gainLoss: input.gainLoss,
      journalEntryId: entry.id,
      createdAt: '',
      updatedAt: '',
    });

    this.disposedAssets.add(input.assetId);
    await this.deps.assets.update(input.assetId, {
      status: 'disposed',
      disposalDate: input.disposalDate,
      disposalProceeds: input.proceeds,
      disposalJournalEntryId: entry.id,
    });

    let vatSourceEntryId: ID | undefined;
    if (input.vat && this.deps.vatSourceEntries) {
      const vatRow = await this.deps.vatSourceEntries.create({
        id: '',
        sourceType: 'asset_disposal',
        sourceId: disposal.id,
        transactionDate: input.disposalDate,
        taxRateId: input.vat.taxRateId,
        treatment: input.vat.treatment,
        direction: input.vat.direction,
        taxableAmount: input.vat.taxableAmount,
        vatAmount: input.vat.vatAmount,
        grossAmount: input.vat.grossAmount,
        classification: input.vat.classification,
        journalEntryId: entry.id,
        reason: input.vat.reason,
        createdAt: '',
        updatedAt: '',
      });
      vatSourceEntryId = vatRow.id;
    }

    const result: PostDisposalResult = { idempotent: false, disposal, journalEntryId: entry.id, vatSourceEntryId };
    this.log.set(input.disposalId, result);
    return result;
  }
}
