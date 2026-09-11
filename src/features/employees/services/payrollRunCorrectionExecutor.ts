import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, PayrollRun, PayslipLine } from '@/types';

/**
 * One logical "reverse this posted payroll run" operation — the
 * payroll-owned correction/reversal workflow `journalEntryService.ts`'s
 * generic SUBLEDGER_OWNED_SOURCES block for `source: 'payroll'` was always
 * meant to be paired with (Leases + Payroll integrity audit, PART 2, audit
 * item 5).
 *
 * The real executor is the atomic Postgres RPC
 * `post_payroll_run_correction` (migration 0093): one implicit transaction
 * that reads the ORIGINAL journal's own lines, posts their exact
 * mathematical inverse (debit/credit swapped) as a NEW journal (source:
 * `payroll_correction`), and marks the original run reversed
 * (`reversedAt`/`reversalJournalEntryId`/`reversalReason`/`reversedBy`) —
 * all or nothing. The original run's `payslips`/`journalEntryId`/`status`
 * are never mutated or deleted; both the original journal and the reversal
 * stay on the books permanently. `RealPayrollRunCorrectionExecutor` calls
 * it; `FakePayrollRunCorrectionExecutor` mirrors its exact contract over
 * the in-memory mocks for tests.
 *
 * A genuinely corrected run for the freed pay period is then just a normal
 * new `PayrollRunService.createPayrollRun()` — no second "correction run"
 * concept exists, matching this codebase's "adapt what already exists"
 * discipline.
 */
export interface PostPayrollRunCorrectionInput {
  /** Stable, immutable identity of this reversal intent — same caller-generated-UUID convention as `DisposalExecutor`'s `disposalId`. De-duplicated by `payroll_run_correction_log`'s UNIQUE (company_id, correction_id). */
  correctionId: ID;
  payrollRunId: ID;
  reversalDate: string;
  reason: string;
  createdBy?: ID;
}

export interface PostPayrollRunCorrectionResult {
  idempotent: boolean;
  reversalJournalEntryId: ID;
  run: PayrollRun;
}

export interface PayrollRunCorrectionExecutor {
  postCorrection(input: PostPayrollRunCorrectionInput): Promise<PostPayrollRunCorrectionResult>;
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

/** Production: the atomic `post_payroll_run_correction` RPC (migration 0093). */
export class RealPayrollRunCorrectionExecutor implements PayrollRunCorrectionExecutor {
  constructor(private readonly client: SupabaseClient) {}

  async postCorrection(input: PostPayrollRunCorrectionInput): Promise<PostPayrollRunCorrectionResult> {
    const { data, error } = await this.client.rpc('post_payroll_run_correction', {
      p_correction_id: input.correctionId,
      p_payroll_run_id: input.payrollRunId,
      p_reversal_date: input.reversalDate,
      p_reason: input.reason,
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`post_payroll_run_correction: ${error.message}`);
    const row = data as { idempotent: boolean; reversal_journal_entry_id: string; run: PayrollRunRow };
    return { idempotent: row.idempotent, reversalJournalEntryId: row.reversal_journal_entry_id, run: rowToRun(row.run) };
  }
}

/** Minimal surfaces the fake executor needs. */
export interface FakePayrollRunCorrectionExecutorDeps {
  journal: {
    /** Reads the original journal's own posted lines (`journalEntryService.getEntry()`'s shape) — the fake mirrors the RPC reading `journal_lines` directly rather than trusting a recomputation. */
    getEntry(journalEntryId: ID): Promise<{ lines: { accountId: ID; description?: string; debit: number; credit: number }[] } | undefined>;
    postJournalEntry(input: { date: string; memo?: string; source: string; lines: { accountId: ID; description?: string; debit: number; credit: number }[] }): Promise<{ id: ID }>;
  };
  runs: {
    getById(id: ID): Promise<PayrollRun | undefined>;
    update(id: ID, patch: Partial<PayrollRun>): Promise<PayrollRun>;
  };
  beforeCommit?: () => void | Promise<void>;
}

/** Test double. Mirrors `post_payroll_run_correction` step for step — including de-duplication on the stable `correctionId`, the posted-only/not-already-reversed re-validation, and the exact debit/credit swap of the original journal's own lines. */
export class FakePayrollRunCorrectionExecutor implements PayrollRunCorrectionExecutor {
  private readonly log = new Map<ID, PostPayrollRunCorrectionResult>();

  constructor(private readonly deps: FakePayrollRunCorrectionExecutorDeps) {}

  async postCorrection(input: PostPayrollRunCorrectionInput): Promise<PostPayrollRunCorrectionResult> {
    const seen = this.log.get(input.correctionId);
    if (seen) return { ...seen, idempotent: true };

    if (!input.reason || input.reason.trim() === '') {
      throw new Error('post_payroll_run_correction: a reason is required to reverse a posted payroll run');
    }

    const run = await this.deps.runs.getById(input.payrollRunId);
    if (!run) throw new Error(`post_payroll_run_correction: payroll run ${input.payrollRunId} not found in company`);
    if (run.status !== 'posted') {
      throw new Error(`post_payroll_run_correction: payroll run ${run.runNumber} is not posted (status: ${run.status}) — only a posted run can be reversed`);
    }
    if (run.reversedAt) {
      throw new Error(`post_payroll_run_correction: payroll run ${run.runNumber} has already been reversed`);
    }
    if (!run.journalEntryId) {
      throw new Error(`post_payroll_run_correction: payroll run ${run.runNumber} has no journal entry to reverse`);
    }

    const originalEntry = await this.deps.journal.getEntry(run.journalEntryId);
    if (!originalEntry || originalEntry.lines.length === 0) {
      throw new Error(`post_payroll_run_correction: original journal ${run.journalEntryId} for run ${run.runNumber} has no lines to reverse`);
    }

    await this.deps.beforeCommit?.();

    const reversalLines = originalEntry.lines.map((line) => ({
      accountId: line.accountId,
      description: `${line.description ?? ''} (reversal — ${input.reason})`,
      debit: line.credit,
      credit: line.debit,
    }));

    const reversalEntry = await this.deps.journal.postJournalEntry({
      date: input.reversalDate,
      memo: `Reversal of payroll run ${run.runNumber} (${run.payPeriodStart} to ${run.payPeriodEnd}) — ${input.reason}`,
      source: 'payroll_correction',
      lines: reversalLines,
    });

    const updated = await this.deps.runs.update(input.payrollRunId, {
      reversedAt: new Date().toISOString(),
      reversalJournalEntryId: reversalEntry.id,
      reversalReason: input.reason,
      reversedBy: input.createdBy,
    });

    const result: PostPayrollRunCorrectionResult = { idempotent: false, reversalJournalEntryId: reversalEntry.id, run: updated };
    this.log.set(input.correctionId, result);
    return result;
  }
}
