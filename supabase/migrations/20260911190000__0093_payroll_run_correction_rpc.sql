-- 0093_payroll_run_correction_rpc
-- Leases + Payroll accounting-integrity hardening (PART 2 — payroll
-- correction/reversal workflow, audit item 5). AUTHORED, NOT APPLIED.
-- Apply AFTER 0091 (reads/writes the reversal columns it adds).
--
-- `journalEntryService.ts` already blocks a GENERIC reversal of any
-- `source: 'payroll'` journal (SUBLEDGER_OWNED_SOURCES) — reversing the GL
-- side alone would leave `payroll_runs.status: 'posted'` and every payslip
-- line untouched, invisible to EMP201/EMP501 which derive their totals
-- from posted PayrollRuns, not from the GL. That guard was correct, but it
-- left NO way to correct a posted run at all short of "a manual balancing
-- journal against a different account" (the journalEntryService.ts
-- comment's own words) — an orphan journal with no link back to the run it
-- was correcting, invisible to EMP201/EMP501 for the SAME reason a naive
-- reversal would have been.
--
-- This migration is the supported payroll-owned mechanism the generic
-- block was always meant to be paired with — same relationship
-- `post_fixed_asset_disposal` (0083) has to the fixed-asset SUBLEDGER_OWNED
-- guard. `post_payroll_run_correction`:
--   1. Reads the ORIGINAL journal's own posted lines (`journal_lines` for
--      `payroll_runs.journal_entry_id`) and reverses them by swapping
--      debit/credit on every line — the mathematically exact inverse of
--      what was actually posted, derived from the source of truth itself
--      rather than recomputed in TypeScript (which could drift from what
--      was really posted). Posts that reversal as a NEW journal,
--      `source: 'payroll_correction'`, referencing the original run.
--   2. Marks the ORIGINAL `payroll_runs` row reversed (`reversed_at`,
--      `reversal_journal_entry_id`, `reversal_reason`, `reversed_by`) —
--      never deletes or mutates its `payslips`/`journal_entry_id`/
--      `status`. The original run's full history (its journal AND the
--      reversal) stays on the books permanently, exactly like a Fixed
--      Asset disposal never deletes the asset's depreciation history.
--   3. Frees the run's pay period (0091's EXCLUDE constraint is scoped
--      `where reversed_at is null`) so a genuinely corrected run for the
--      same period can be created through the EXISTING
--      `PayrollRunService.createPayrollRun()` / `postPayrollRun()` path —
--      no second "correction run" concept invented; a correction IS a
--      normal new payroll run, for a period the reversal has just
--      re-opened.
--
-- IDEMPOTENCY / CONCURRENCY: `payroll_run_correction_log` — UNIQUE
-- (company_id, correction_id), same caller-generated-UUID convention as
-- 0088/0090's commencement_id/termination_id. The LOCKED payroll_runs
-- row's `reversed_at is null` check is the structural backstop — a run can
-- only ever be reversed once, full stop, independent of correction_id
-- bookkeeping.

create table public.payroll_run_correction_log (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  correction_id     uuid not null,
  payroll_run_id    uuid not null,
  reversal_journal_entry_id uuid references public.journal_entries(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (company_id, correction_id)
);

create index payroll_run_correction_log_company_id_idx on public.payroll_run_correction_log (company_id);
create index payroll_run_correction_log_run_id_idx on public.payroll_run_correction_log (payroll_run_id);

alter table public.payroll_run_correction_log enable row level security;

create policy payroll_run_correction_log_all_own_company on public.payroll_run_correction_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- The atomic executor
-- ========================================================================
create or replace function public.post_payroll_run_correction(
  p_correction_id    uuid,
  p_payroll_run_id   uuid,
  p_reversal_date    timestamptz,
  p_reason           text,
  p_created_by       text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company     uuid := (select public.get_my_company_id());
  v_log_id      uuid;
  v_existing    public.payroll_run_correction_log;
  v_run         public.payroll_runs;
  v_reversal_je public.journal_entries;
  v_lines       jsonb;
  v_total_debit  numeric;
  v_total_credit numeric;
begin
  if v_company is null then
    raise exception 'post_payroll_run_correction: no company context';
  end if;
  if p_correction_id is null then
    raise exception 'post_payroll_run_correction: correction_id is required';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'post_payroll_run_correction: a reason is required to reverse a posted payroll run';
  end if;

  -- IDEMPOTENCY on the STABLE correction id.
  insert into public.payroll_run_correction_log (company_id, correction_id, payroll_run_id, created_by)
  values (v_company, p_correction_id, p_payroll_run_id, p_created_by)
  on conflict (company_id, correction_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.payroll_run_correction_log
      where company_id = v_company and correction_id = p_correction_id;
    select * into v_run from public.payroll_runs where id = v_existing.payroll_run_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'reversal_journal_entry_id', v_existing.reversal_journal_entry_id,
      'run', to_jsonb(v_run));
  end if;

  -- LOCK the run — serialises a concurrent reversal attempt on the same run.
  select * into v_run from public.payroll_runs
    where id = p_payroll_run_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_payroll_run_correction: payroll run % not found in company', p_payroll_run_id;
  end if;

  -- RE-VALIDATE against the LOCKED row.
  if v_run.status <> 'posted' then
    raise exception 'post_payroll_run_correction: payroll run % is not posted (status: %) — only a posted run can be reversed', v_run.run_number, v_run.status;
  end if;
  if v_run.reversed_at is not null then
    raise exception 'post_payroll_run_correction: payroll run % has already been reversed', v_run.run_number;
  end if;
  if v_run.journal_entry_id is null then
    raise exception 'post_payroll_run_correction: payroll run % has no journal entry to reverse', v_run.run_number;
  end if;

  -- open accounting period for the REVERSAL date (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_reversal_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_payroll_run_correction: no open accounting period covers %', p_reversal_date::date;
  end if;

  -- Derive the reversal lines as the EXACT mathematical inverse of what
  -- was actually posted — swap debit/credit on every line of the original
  -- journal, read from journal_lines itself (the source of truth), not
  -- recomputed from payslips (which could have drifted, or whose
  -- recomputation logic could itself contain the very bug being
  -- corrected).
  select jsonb_agg(jsonb_build_object(
           'account_id', jl.account_id,
           'description', coalesce(jl.description, '') || ' (reversal — ' || p_reason || ')',
           'debit', jl.credit,
           'credit', jl.debit
         ) order by jl.line_no)
    into v_lines
    from public.journal_lines jl
   where jl.journal_entry_id = v_run.journal_entry_id and jl.company_id = v_company;

  if v_lines is null or jsonb_array_length(v_lines) = 0 then
    raise exception 'post_payroll_run_correction: original journal % for run % has no lines to reverse', v_run.journal_entry_id, v_run.run_number;
  end if;

  -- JOURNAL BALANCING: a straight debit/credit swap of an already-balanced
  -- set of lines is balanced by construction (sum(newDebit) = sum(oldCredit)
  -- = sum(oldDebit) = sum(newCredit) iff the original balanced) — but this
  -- function still re-verifies it explicitly, the same defense-in-depth
  -- every sibling RPC in this migration set applies, rather than trusting
  -- that construction argument silently. create_journal_entry_with_lines()
  -- itself has no balance check of its own.
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(v_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'post_payroll_run_correction: derived reversal lines do not balance (debit % vs credit %) — the original journal % itself was not balanced, which should never happen', v_total_debit, v_total_credit, v_run.journal_entry_id;
  end if;

  v_reversal_je := public.create_journal_entry_with_lines(
    v_company, '', p_reversal_date,
    'Reversal of payroll run ' || v_run.run_number || ' (' || v_run.pay_period_start::date || ' to ' || v_run.pay_period_end::date || ') — ' || p_reason,
    'posted', now(), null, 'payroll_correction', null, v_lines
  );

  update public.payroll_runs
     set reversed_at = now(),
         reversal_journal_entry_id = v_reversal_je.id,
         reversal_reason = p_reason,
         reversed_by = p_created_by,
         updated_at = now()
   where id = p_payroll_run_id and company_id = v_company
   returning * into v_run;

  update public.payroll_run_correction_log set reversal_journal_entry_id = v_reversal_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'reversal_journal_entry_id', v_reversal_je.id, 'run', to_jsonb(v_run));
end;
$$;

revoke all on function public.post_payroll_run_correction(
  uuid, uuid, timestamptz, text, text
) from public, anon;
grant execute on function public.post_payroll_run_correction(
  uuid, uuid, timestamptz, text, text
) to authenticated;

-- `payroll_correction` joins the SUBLEDGER_OWNED_SOURCES-equivalent
-- treatment at the TypeScript layer (journalEntryService.ts) — a reversal
-- OF a reversal is nonsensical (there is nothing further for it to
-- desync), so it is blocked there the same way `payroll`/`lease_*` already
-- are, not re-litigated here at the DB layer.
