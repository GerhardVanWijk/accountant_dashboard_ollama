import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, PayrollRun, PayslipLine } from '@/types';
import type { NewJournalLineInput } from '@/features/accounting/services';

/**
 * One logical "post this draft payroll run" operation.
 *
 * The real executor is the atomic Postgres RPC `post_payroll_run`
 * (migration 0091): one implicit transaction that posts the combined
 * journal AND flips the run to 'posted' with its journalEntryId/
 * contraAccountId — all or nothing. Also enforces the Banking fix (PART 3
 * of the audit): the contra account must resolve to a liability account
 * (Net Pay Payable), never Cash and Bank directly — see that migration's
 * header. `RealPayrollRunPostingExecutor` calls it;
 * `FakePayrollRunPostingExecutor` mirrors its exact contract over the
 * in-memory mocks for tests. Same Real/Fake split as `DepreciationPeriodExecutor`
 * (src/features/assets/services/) — a payroll run posts at most once, ever
 * (like a disposal, not a recurring period), so the idempotency key is the
 * run's own stable id, no separate caller-generated token needed.
 */
export interface PostPayrollRunInput {
  payrollRunId: ID;
  payDate: string;
  memo: string;
  source: string;
  /** The already-computed, already-balanced journal lines for the whole run. */
  lines: NewJournalLineInput[];
  /** MUST be a liability/clearing account (2250 Net Pay Payable) — never Cash and Bank. Enforced again, server-side, by the RPC itself. */
  contraAccountId: ID;
  createdBy?: ID;
}

export interface PostPayrollRunResult {
  idempotent: boolean;
  journalEntryId: ID;
  run: PayrollRun;
}

export interface PayrollRunPostingExecutor {
  postRun(input: PostPayrollRunInput): Promise<PostPayrollRunResult>;
}

interface PayrollRunRow {
  id: string;
  run_number: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  status: string;
  payslips: PayslipLine[];
  journal_entry_id: string | null;
  contra_account_id: string | null;
  payroll_tax_year_config_id: string | null;
  reversed_at: string | null;
  reversal_journal_entry_id: string | null;
  reversal_reason: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRun(row: PayrollRunRow): PayrollRun {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    runNumber: row.run_number,
    payPeriodStart: row.pay_period_start,
    payPeriodEnd: row.pay_period_end,
    payDate: row.pay_date,
    status: row.status as PayrollRun['status'],
    payslips: row.payslips ?? [],
    journalEntryId: row.journal_entry_id ?? undefined,
    contraAccountId: row.contra_account_id ?? undefined,
    payrollTaxYearConfigId: row.payroll_tax_year_config_id ?? undefined,
    reversedAt: row.reversed_at ?? undefined,
    reversalJournalEntryId: row.reversal_journal_entry_id ?? undefined,
    reversalReason: row.reversal_reason ?? undefined,
    reversedBy: row.reversed_by ?? undefined,
  };
}

/** Production: the atomic `post_payroll_run` RPC (migration 0091). */
export class RealPayrollRunPostingExecutor implements PayrollRunPostingExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postRun(input: PostPayrollRunInput): Promise<PostPayrollRunResult> {
    const { data, error } = await this.client.rpc('post_payroll_run', {
      p_payroll_run_id: input.payrollRunId,
      p_pay_date: input.payDate,
      p_memo: input.memo,
      p_source: input.source,
      p_lines: input.lines.map((line) => ({
        account_id: line.accountId,
        description: line.description ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
      p_contra_account_id: input.contraAccountId,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`post_payroll_run: ${error.message}`);
    const row = data as { idempotent: boolean; journal_entry_id: string; run: PayrollRunRow };
    return { idempotent: row.idempotent, journalEntryId: row.journal_entry_id, run: rowToRun(row.run) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakePayrollRunPostingExecutorDeps {
  journal: {
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: NewJournalLineInput[] }): Promise<{ id: ID }>;
  };
  runs: {
    getById(id: ID): Promise<PayrollRun | undefined>;
    update(id: ID, patch: Partial<PayrollRun>): Promise<PayrollRun>;
  };
  /** Resolves an account id's `type` — used to emulate the RPC's "contra account must be a liability" guard. Optional: omitted in tests that don't need it. */
  accounts?: {
    getType(accountId: ID): Promise<string | undefined>;
  };
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_payroll_run` step for step — including de-duplication on the run's own stable id and the draft-only re-validation. */
export class FakePayrollRunPostingExecutor implements PayrollRunPostingExecutor {
  private readonly log = new Map<ID, PostPayrollRunResult>();

  constructor(private readonly deps: FakePayrollRunPostingExecutorDeps) {}

  async postRun(input: PostPayrollRunInput): Promise<PostPayrollRunResult> {
    const seen = this.log.get(input.payrollRunId);
    if (seen) return { ...seen, idempotent: true };

    const run = await this.deps.runs.getById(input.payrollRunId);
    if (!run) throw new Error(`post_payroll_run: payroll run ${input.payrollRunId} not found in company`);
    if (run.status !== 'draft') {
      throw new Error(`post_payroll_run: payroll run ${run.runNumber} has already been posted`);
    }
    if (run.payslips.length === 0) {
      throw new Error(`post_payroll_run: payroll run ${run.runNumber} has no payslip lines to post`);
    }

    if (this.deps.accounts) {
      const type = await this.deps.accounts.getType(input.contraAccountId);
      if (type && type !== 'liability') {
        throw new Error(
          `post_payroll_run: contra account must be a liability/clearing account (e.g. Net Pay Payable), not ${type}. Net pay is settled later through Banking — a payroll run must never credit Cash and Bank directly.`,
        );
      }
    }

    await this.deps.beforeCommit?.();

    const entry = await this.deps.journal.postJournalEntry({ date: input.payDate, memo: input.memo, source: input.source, lines: input.lines });

    const updated = await this.deps.runs.update(input.payrollRunId, {
      status: 'posted',
      journalEntryId: entry.id,
      contraAccountId: input.contraAccountId,
    });

    const result: PostPayrollRunResult = { idempotent: false, journalEntryId: entry.id, run: updated };
    this.log.set(input.payrollRunId, result);
    return result;
  }
}
