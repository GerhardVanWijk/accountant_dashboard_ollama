import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types/common';
import type { LeaseAmortizationEntry } from '@/types/lease';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "post one period's lease amortization across every eligible
 * lease" operation.
 *
 * The real executor is the atomic Postgres RPC
 * `post_lease_amortization_period` (migration 0089): one implicit
 * transaction that posts the combined journal AND every lease's
 * amortization entry + running-balance snapshot — all or nothing. Also
 * enforces the Banking fix (PART 3 of the audit): the clearing account
 * parameter must resolve to a liability account, never Cash and Bank
 * directly — see that migration's header. `RealLeaseAmortizationPeriodExecutor`
 * calls it; `FakeLeaseAmortizationPeriodExecutor` mirrors its exact
 * contract over the in-memory mocks for tests. Same Real/Fake split as
 * `DepreciationPeriodExecutor` (src/features/assets/services/), whose
 * combined-entry-per-run shape this mirrors almost exactly.
 */
export interface LeaseAmortizationPeriodLineInput {
  leaseId: ID;
  interest: number;
  principal: number;
  depreciation: number;
  outstandingLeaseLiabilityAfter: number;
  accumulatedDepreciationAfter: number;
}

export interface PostLeaseAmortizationPeriodInput {
  /** Stable, immutable identity of this period-posting intent — mirrors `DepreciationPeriodExecutor`'s `runId`. De-duplicated by `lease_amortization_posting_log`'s UNIQUE (company_id, run_id). */
  runId: ID;
  periodEnd: string;
  memo: string;
  source: string;
  lines: LeaseAmortizationPeriodLineInput[];
  /** The already-aggregated debit-vector journal lines (interest / lease liability / lease payment clearing / ROU depreciation / accumulated depreciation), netted across every eligible lease exactly as leaseAmortizationService.ts computes today. */
  journalLines: NewJournalLineInput[];
  /** MUST be a liability/clearing account (2460 Lease Payment Clearing) — never Cash and Bank. Enforced again, server-side, by the RPC itself. */
  leasePaymentClearingAccountId: ID;
  createdBy?: ID;
}

export interface PostLeaseAmortizationPeriodResult {
  idempotent: boolean;
  journalEntryId: ID;
  entries: LeaseAmortizationEntry[];
}

export interface LeaseAmortizationPeriodExecutor {
  postPeriod(input: PostLeaseAmortizationPeriodInput): Promise<PostLeaseAmortizationPeriodResult>;
}

interface LeaseAmortizationEntryRow {
  id: string;
  lease_id: string;
  period_end: string;
  interest_amount: number | string;
  principal_amount: number | string;
  depreciation_amount: number | string;
  outstanding_lease_liability_after: number | string;
  accumulated_depreciation_after: number | string;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: LeaseAmortizationEntryRow): LeaseAmortizationEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leaseId: row.lease_id,
    periodEnd: row.period_end,
    interestAmount: Number(row.interest_amount),
    principalAmount: Number(row.principal_amount),
    depreciationAmount: Number(row.depreciation_amount),
    outstandingLeaseLiabilityAfter: Number(row.outstanding_lease_liability_after),
    accumulatedDepreciationAfter: Number(row.accumulated_depreciation_after),
    journalEntryId: row.journal_entry_id,
  };
}

/** Production: the atomic `post_lease_amortization_period` RPC (migration 0089). */
export class RealLeaseAmortizationPeriodExecutor implements LeaseAmortizationPeriodExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postPeriod(input: PostLeaseAmortizationPeriodInput): Promise<PostLeaseAmortizationPeriodResult> {
    const { data, error } = await this.client.rpc('post_lease_amortization_period', {
      p_run_id: input.runId,
      p_period_end: input.periodEnd,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: input.lines.map((line) => ({
        lease_id: line.leaseId,
        interest: line.interest,
        principal: line.principal,
        depreciation: line.depreciation,
        outstanding_lease_liability_after: line.outstandingLeaseLiabilityAfter,
        accumulated_depreciation_after: line.accumulatedDepreciationAfter,
      })),
      p_journal_lines: input.journalLines.map((line) => ({
        account_id: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
      p_lease_payment_clearing_account_id: input.leasePaymentClearingAccountId,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`post_lease_amortization_period: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string; entries: LeaseAmortizationEntryRow[] };
    return {
      idempotent: row.idempotent,
      journalEntryId: row.journal_entry_id,
      entries: (row.entries ?? []).map(rowToEntry),
    };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakeLeaseAmortizationPeriodExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  leases: {
    getById(id: ID): Promise<{ status: string } | undefined>;
    update(id: ID, patch: { outstandingLeaseLiability: number; accumulatedDepreciation: number }): Promise<unknown>;
  };
  amortizationEntries: {
    create(entity: Omit<LeaseAmortizationEntry, 'id' | 'createdAt' | 'updatedAt'> & { id: ''; createdAt: ''; updatedAt: '' }): Promise<LeaseAmortizationEntry>;
  };
  /** Resolves an account id's `type` — used to emulate the RPC's "clearing account must be a liability" guard. Optional: omitted in tests that don't need it. */
  accounts?: {
    getType(accountId: ID): Promise<string | undefined>;
  };
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_lease_amortization_period` step for step — including de-duplication on the stable `runId` and the hard "one lease, one entry per month" rule the DB enforces via UNIQUE (company_id, lease_id, period_end). */
export class FakeLeaseAmortizationPeriodExecutor implements LeaseAmortizationPeriodExecutor {
  private readonly log = new Map<ID, PostLeaseAmortizationPeriodResult>();
  private readonly posted = new Set<string>();

  constructor(private readonly deps: FakeLeaseAmortizationPeriodExecutorDeps) {}

  async postPeriod(input: PostLeaseAmortizationPeriodInput): Promise<PostLeaseAmortizationPeriodResult> {
    const seen = this.log.get(input.runId);
    if (seen) return { ...seen, idempotent: true };

    if (input.lines.length === 0) {
      throw new Error('post_lease_amortization_period: at least one line is required');
    }

    if (this.deps.accounts) {
      const type = await this.deps.accounts.getType(input.leasePaymentClearingAccountId);
      if (type && type !== 'liability') {
        throw new Error(
          `post_lease_amortization_period: lease payment clearing account must be a liability/clearing account, not ${type}. The lease payment is settled later through Banking — this run must never credit Cash and Bank directly.`,
        );
      }
    }

    const monthKey = input.periodEnd.slice(0, 7);
    for (const line of input.lines) {
      const lease = await this.deps.leases.getById(line.leaseId);
      if (!lease) throw new Error(`post_lease_amortization_period: lease ${line.leaseId} not found in company`);
      if (lease.status !== 'active') {
        throw new Error(`post_lease_amortization_period: lease ${line.leaseId} is ${lease.status} — amortization can only be posted for an active lease`);
      }
      const key = `${line.leaseId}|${monthKey}`;
      if (this.posted.has(key)) {
        throw new Error(`post_lease_amortization_period: lease ${line.leaseId} already has an amortization entry for ${input.periodEnd}`);
      }
    }

    await this.deps.beforeCommit?.();

    const entry = await this.deps.journal.postJournalEntry({ date: input.periodEnd, memo: input.memo, source: input.source, lines: input.journalLines });

    const entries: LeaseAmortizationEntry[] = [];
    for (const line of input.lines) {
      const created = await this.deps.amortizationEntries.create({
        id: '',
        leaseId: line.leaseId,
        periodEnd: input.periodEnd,
        interestAmount: line.interest,
        principalAmount: line.principal,
        depreciationAmount: line.depreciation,
        outstandingLeaseLiabilityAfter: line.outstandingLeaseLiabilityAfter,
        accumulatedDepreciationAfter: line.accumulatedDepreciationAfter,
        journalEntryId: entry.id,
        createdAt: '',
        updatedAt: '',
      });
      entries.push(created);
      this.posted.add(`${line.leaseId}|${monthKey}`);
      await this.deps.leases.update(line.leaseId, {
        outstandingLeaseLiability: line.outstandingLeaseLiabilityAfter,
        accumulatedDepreciation: line.accumulatedDepreciationAfter,
      });
    }

    const result: PostLeaseAmortizationPeriodResult = { idempotent: false, journalEntryId: entry.id, entries };
    this.log.set(input.runId, result);
    return result;
  }
}
