import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types/common';
import type { LeaseContract, LeaseStatus } from '@/types/lease';

/**
 * One logical "commence this draft lease" operation.
 *
 * The real executor is the atomic Postgres RPC `post_lease_commencement`
 * (migration 0088): one implicit transaction that posts the capitalization
 * journal AND flips the lease to 'active' with its outstanding liability
 * set — all or nothing. `RealLeaseCommencementExecutor` calls it;
 * `FakeLeaseCommencementExecutor` mirrors its exact contract over the
 * in-memory mocks for tests. Same Real/Fake split as
 * `DisposalExecutor`/`DepreciationPeriodExecutor` (src/features/assets/services/).
 */
export interface PostLeaseCommencementInput {
  /**
   * Stable, immutable identity of this logical commencement — a UUID
   * generated client-side BEFORE the RPC runs. A retry of the same intent
   * re-uses it. De-duplicated by `lease_commencement_log`'s UNIQUE
   * (company_id, commencement_id).
   */
  commencementId: ID;
  leaseId: ID;
  commencementDate: string;
  memo: string;
  source: string;
  rightOfUseAssetAccountId: ID;
  leaseLiabilityAccountId: ID;
  createdBy?: ID;
}

export interface PostLeaseCommencementResult {
  idempotent: boolean;
  journalEntryId: ID;
  lease: LeaseContract;
}

export interface LeaseCommencementExecutor {
  postCommencement(input: PostLeaseCommencementInput): Promise<PostLeaseCommencementResult>;
}

interface LeaseContractRow {
  id: string;
  lease_number: string;
  lessor_name: string;
  asset_description: string;
  commencement_date: string;
  lease_term_months: number;
  monthly_payment: number | string;
  discount_rate_percent: number | string;
  status: LeaseStatus;
  initial_lease_liability: number | string;
  initial_right_of_use_asset: number | string;
  accumulated_depreciation: number | string;
  outstanding_lease_liability: number | string;
  journal_entry_id: string | null;
  termination_date: string | null;
  termination_journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToLease(row: LeaseContractRow): LeaseContract {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leaseNumber: row.lease_number,
    lessorName: row.lessor_name,
    assetDescription: row.asset_description,
    commencementDate: row.commencement_date,
    leaseTermMonths: row.lease_term_months,
    monthlyPayment: Number(row.monthly_payment),
    discountRatePercent: Number(row.discount_rate_percent),
    status: row.status,
    initialLeaseLiability: Number(row.initial_lease_liability),
    initialRightOfUseAsset: Number(row.initial_right_of_use_asset),
    accumulatedDepreciation: Number(row.accumulated_depreciation),
    outstandingLeaseLiability: Number(row.outstanding_lease_liability),
    journalEntryId: row.journal_entry_id ?? undefined,
    terminationDate: row.termination_date ?? undefined,
    terminationJournalEntryId: row.termination_journal_entry_id ?? undefined,
  };
}

/** Production: the atomic `post_lease_commencement` RPC (migration 0088). */
export class RealLeaseCommencementExecutor implements LeaseCommencementExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postCommencement(input: PostLeaseCommencementInput): Promise<PostLeaseCommencementResult> {
    const { data, error } = await this.client.rpc('post_lease_commencement', {
      p_commencement_id: input.commencementId,
      p_lease_id: input.leaseId,
      p_commencement_date: input.commencementDate,
      p_memo: input.memo,
      p_source: input.source,
      p_right_of_use_asset_account_id: input.rightOfUseAssetAccountId,
      p_lease_liability_account_id: input.leaseLiabilityAccountId,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`post_lease_commencement: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string; lease: LeaseContractRow };
    return { idempotent: row.idempotent, journalEntryId: row.journal_entry_id, lease: rowToLease(row.lease) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeLeaseCommencementExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: { accountId: ID; description?: string; debit: number; credit: number }[] }): Promise<{ id: ID }>;
  };
  leases: {
    getById(id: ID): Promise<LeaseContract | undefined>;
    update(id: ID, patch: Partial<LeaseContract>): Promise<LeaseContract>;
  };
  /** Test-only hook, fired after validation but before any write — see FakeDepreciationPeriodExecutorDeps. */
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_lease_commencement` step for step, including de-duplication on the stable `commencementId` and the draft-only re-validation. */
export class FakeLeaseCommencementExecutor implements LeaseCommencementExecutor {
  private readonly log = new Map<ID, PostLeaseCommencementResult>();

  constructor(private readonly deps: FakeLeaseCommencementExecutorDeps) {}

  async postCommencement(input: PostLeaseCommencementInput): Promise<PostLeaseCommencementResult> {
    const seen = this.log.get(input.commencementId);
    if (seen) return { ...seen, idempotent: true };

    const lease = await this.deps.leases.getById(input.leaseId);
    if (!lease) throw new Error(`post_lease_commencement: lease ${input.leaseId} not found in company`);
    if (lease.status !== 'draft') {
      throw new Error(`post_lease_commencement: lease ${lease.leaseNumber} has already commenced (status: ${lease.status})`);
    }

    await this.deps.beforeCommit?.();

    const amount = lease.initialLeaseLiability;
    const entry = await this.deps.journal.postJournalEntry({
      date: input.commencementDate,
      memo: input.memo,
      source: input.source,
      lines: [
        { accountId: input.rightOfUseAssetAccountId, description: input.memo, debit: amount, credit: 0 },
        { accountId: input.leaseLiabilityAccountId, description: input.memo, debit: 0, credit: amount },
      ],
    });

    const updated = await this.deps.leases.update(input.leaseId, {
      status: 'active',
      outstandingLeaseLiability: amount,
      journalEntryId: entry.id,
    });

    const result: PostLeaseCommencementResult = { idempotent: false, journalEntryId: entry.id, lease: updated };
    this.log.set(input.commencementId, result);
    return result;
  }
}
