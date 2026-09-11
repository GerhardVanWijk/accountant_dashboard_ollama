import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types/common';
import type { LeaseContract, LeaseStatus } from '@/types/lease';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "terminate this lease" operation.
 *
 * The real executor is the atomic Postgres RPC `post_lease_termination`
 * (migration 0090): one implicit transaction that posts the termination
 * (derecognition) journal AND flips the lease to 'terminated' — all or
 * nothing. `RealLeaseTerminationExecutor` calls it;
 * `FakeLeaseTerminationExecutor` mirrors its exact contract over the
 * in-memory mocks for tests. Same Real/Fake split as `DisposalExecutor`
 * (src/features/assets/services/disposalExecutor.ts), whose gain/loss
 * shape `LeaseDisposalService.terminateLease()` already mirrors line for
 * line.
 */
export interface PostLeaseTerminationInput {
  /** Stable, immutable identity of this termination intent — mirrors `DisposalExecutor`'s `disposalId`. De-duplicated by `lease_termination_log`'s UNIQUE (company_id, termination_id). */
  terminationId: ID;
  leaseId: ID;
  terminationDate: string;
  memo: string;
  source: string;
  /** The termination journal's already-computed lines. */
  lines: NewJournalLineInput[];
  createdBy?: ID;
}

export interface PostLeaseTerminationResult {
  idempotent: boolean;
  journalEntryId: ID;
  lease: LeaseContract;
}

export interface LeaseTerminationExecutor {
  postTermination(input: PostLeaseTerminationInput): Promise<PostLeaseTerminationResult>;
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

/** Production: the atomic `post_lease_termination` RPC (migration 0090). */
export class RealLeaseTerminationExecutor implements LeaseTerminationExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postTermination(input: PostLeaseTerminationInput): Promise<PostLeaseTerminationResult> {
    const { data, error } = await this.client.rpc('post_lease_termination', {
      p_termination_id: input.terminationId,
      p_lease_id: input.leaseId,
      p_termination_date: input.terminationDate,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: input.lines.map((line) => ({
        account_id: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`post_lease_termination: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string; lease: LeaseContractRow };
    return { idempotent: row.idempotent, journalEntryId: row.journal_entry_id, lease: rowToLease(row.lease) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeLeaseTerminationExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  leases: {
    getById(id: ID): Promise<LeaseContract | undefined>;
    update(id: ID, patch: Partial<LeaseContract>): Promise<LeaseContract>;
  };
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_lease_termination` step for step, including de-duplication on the stable `terminationId` and the draft/terminated re-validation. */
export class FakeLeaseTerminationExecutor implements LeaseTerminationExecutor {
  private readonly log = new Map<ID, PostLeaseTerminationResult>();

  constructor(private readonly deps: FakeLeaseTerminationExecutorDeps) {}

  async postTermination(input: PostLeaseTerminationInput): Promise<PostLeaseTerminationResult> {
    const seen = this.log.get(input.terminationId);
    if (seen) return { ...seen, idempotent: true };

    const lease = await this.deps.leases.getById(input.leaseId);
    if (!lease) throw new Error(`post_lease_termination: lease ${input.leaseId} not found in company`);
    if (lease.status === 'draft') {
      throw new Error(`post_lease_termination: lease ${lease.leaseNumber} has not commenced yet (still a draft)`);
    }
    if (lease.status === 'terminated') {
      throw new Error(`post_lease_termination: lease ${lease.leaseNumber} has already been terminated`);
    }

    await this.deps.beforeCommit?.();

    const entry = await this.deps.journal.postJournalEntry({ date: input.terminationDate, memo: input.memo, source: input.source, lines: input.lines });

    const updated = await this.deps.leases.update(input.leaseId, {
      status: 'terminated',
      terminationDate: input.terminationDate,
      terminationJournalEntryId: entry.id,
    });

    const result: PostLeaseTerminationResult = { idempotent: false, journalEntryId: entry.id, lease: updated };
    this.log.set(input.terminationId, result);
    return result;
  }
}
