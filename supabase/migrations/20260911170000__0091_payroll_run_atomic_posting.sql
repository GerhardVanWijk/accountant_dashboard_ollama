-- 0091_payroll_run_atomic_posting
-- Leases + Payroll accounting-integrity hardening (PART 2 — atomic payroll
-- posting, statutory traceability, DB-level period-overlap protection, and
-- PART 3 — Banking/payment architecture). AUTHORED, NOT APPLIED. Apply
-- AFTER 0085 (posts to the 2250 Net Pay Payable account it seeds).
--
-- FOUR independent hardenings, kept in one migration because they all
-- touch `payroll_runs`:
--
-- 1. ATOMIC POSTING. Before this migration, `PayrollRunService.postPayrollRun()`
--    made 2 separate, independently-committing writes (post the combined
--    journal, then update `payroll_runs` to status='posted'/journalEntryId/
--    contraAccountId) — a failure between them leaves a posted GL journal
--    (real Salaries/UIF/SDL/PAYE liability movements) with the run still
--    showing 'draft', and a retry would post a SECOND combined journal —
--    doubling every employee's salary/UIF/PAYE/SDL entry for the period.
--    Same pattern as `post_asset_depreciation_period` (0081): idempotency
--    log keyed on the run's own id (a payroll run posts at most once, ever
--    — `payroll_runs.status` draft->posted is itself the structural
--    backstop, so no separate caller-generated token is needed the way a
--    recurring depreciation/amortization period needs one).
--
-- 2. STATUTORY TRACEABILITY (audit item 4). `payroll_tax_year_config_id`
--    records WHICH `payroll_tax_year_configs` row actually computed this
--    run's payslips — set once, at posting time, never updated afterward.
--    Before this column existed, a PayrollRun carried no record of which
--    tax-year config (which PAYE brackets, UIF ceiling, SDL rate) produced
--    its figures — reproducing a historical run's numbers meant trusting
--    that the config `getConfigForDate(payDate)` would resolve TODAY is
--    the same one that resolved back then, which 0092's immutability
--    trigger enforces but this column makes explicit and queryable
--    regardless.
--
-- 3. DB-LEVEL PERIOD-OVERLAP PROTECTION (audit item 9's "duplicate payroll
--    periods" adversarial case). `PayrollRunService.createPayrollRun()`
--    already rejects an overlapping pay period in TypeScript
--    (`existingRuns.find((r) => overlaps(...))`), but that is a
--    read-then-write check with a race window: two concurrent
--    `createPayrollRun()` calls for the same period can both pass the
--    read before either writes. An EXCLUDE constraint closes that window
--    at the only layer that actually can — allowing Postgres itself to
--    reject the second INSERT inside its own transaction, no race
--    possible. Scoped to `reversed_at is null` (0093 adds that column) —
--    a reversed run must free its period for a genuine re-run, matching
--    the payroll-owned correction workflow's whole point.
--
-- 4. BANKING FIX carried into the RPC (PART 3, same fix as 0089's lease
--    amortization sibling): `post_payroll_run` REQUIRES the contra account
--    to be a liability/clearing account — never Cash and Bank directly.
--    In practice always 2250 Net Pay Payable (0085). The actual EFT
--    disbursement is recorded exactly once, later, through the existing
--    Banking module against this same clearing account
--    (subledgerSettlementService.ts, `matched_entity_type = 'payroll_run'`,
--    see 0086) — never posted twice.

-- ========================================================================
-- 1. Statutory traceability
-- ========================================================================
alter table public.payroll_runs
  add column if not exists payroll_tax_year_config_id uuid references public.payroll_tax_year_configs(id);

comment on column public.payroll_runs.payroll_tax_year_config_id is
  'The PayrollTaxYearConfig actually used to compute this run''s payslips (set once, at creation/posting time, never changed afterward). See migration 0091 / 0092''s companion immutability trigger.';

-- Reversal evidence columns (written by 0093's post_payroll_run_correction,
-- defined here because the period-overlap exclusion constraint below
-- needs `reversed_at` to exist first). `status` deliberately stays
-- `draft_posted_status` ('draft'|'posted') — that enum is shared across 5
-- tables (0007), so a run that has been reversed is still, truthfully,
-- 'posted': it WAS posted, and its journal is still on the books (a
-- reversal is a NEW contra journal, never a deletion/mutation of the
-- original — SA_ACCOUNTING_MASTER_SPEC.md's immutable-history discipline).
-- These columns are the evidence a reversal happened, not a new status.
alter table public.payroll_runs
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_journal_entry_id uuid references public.journal_entries(id),
  add column if not exists reversal_reason text,
  add column if not exists reversed_by text;

-- ========================================================================
-- 2. DB-level period-overlap protection
-- ========================================================================
-- btree_gist is required for an EXCLUDE constraint to use `=` on a plain
-- uuid column (company_id) alongside `&&` on a range — standard, widely
-- available Postgres contrib extension (confirmed available,
-- default_version 1.7, not yet installed — verified live against this
-- project via `pg_available_extensions`). Installed into the `extensions`
-- schema, matching this project's own convention (pgcrypto/uuid-ossp/
-- pg_stat_statements all live there, verified via `pg_extension` — nothing
-- in this schema installs an extension into `public`).
create extension if not exists btree_gist with schema extensions;

-- `pay_period_start`/`pay_period_end` are `timestamptz` (confirmed live via
-- information_schema — not `date`), so the natural `::date` cast is STABLE,
-- not IMMUTABLE (a timestamptz->date cast is timezone-dependent in
-- general), and Postgres refuses to build an index/EXCLUDE constraint over
-- a STABLE expression ("functions in index expression must be marked
-- IMMUTABLE" — confirmed live). Payroll periods are always whole calendar
-- days regardless of session timezone, so pinning the conversion to UTC
-- and wrapping it in an explicitly-IMMUTABLE SQL function is correct here,
-- not a hack: the same instant always yields the same UTC calendar date.
create or replace function public.payroll_period_date(p_ts timestamptz)
returns date
language sql
immutable
as $$ select (p_ts at time zone 'UTC')::date $$;

alter table public.payroll_runs
  add constraint payroll_runs_no_overlapping_period
  exclude using gist (
    company_id with =,
    daterange(public.payroll_period_date(pay_period_start), public.payroll_period_date(pay_period_end), '[]') with &&
  )
  where (reversed_at is null);

-- ========================================================================
-- 3. Idempotency log for atomic posting
-- ========================================================================
create table public.payroll_run_posting_log (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  payroll_run_id    uuid not null,
  journal_entry_id  uuid references public.journal_entries(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (company_id, payroll_run_id)
);

create index payroll_run_posting_log_company_id_idx on public.payroll_run_posting_log (company_id);

alter table public.payroll_run_posting_log enable row level security;

create policy payroll_run_posting_log_all_own_company on public.payroll_run_posting_log
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ========================================================================
-- 4. The atomic executor
-- ========================================================================
-- p_lines: the already-computed, already-balanced journal lines for the
--   whole run (Salaries/UIF/SDL expense, PAYE/UIF/SDL/Other Deductions
--   payable, and the contra account) — computed in TypeScript exactly as
--   today by payrollRunService.postPayrollRun().
create or replace function public.post_payroll_run(
  p_payroll_run_id   uuid,
  p_pay_date         timestamptz,
  p_memo             text,
  p_source           text,
  p_lines            jsonb,
  p_contra_account_id uuid,
  p_created_by       text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company   uuid := (select public.get_my_company_id());
  v_log_id    uuid;
  v_existing  public.payroll_run_posting_log;
  v_run       public.payroll_runs;
  v_je        public.journal_entries;
  v_contra    public.accounts;
  v_total_debit  numeric;
  v_total_credit numeric;
begin
  if v_company is null then
    raise exception 'post_payroll_run: no company context';
  end if;
  if p_payroll_run_id is null then
    raise exception 'post_payroll_run: payroll_run_id is required';
  end if;

  -- IDEMPOTENCY on the run's own STABLE id (a run posts at most once, ever).
  insert into public.payroll_run_posting_log (company_id, payroll_run_id, created_by)
  values (v_company, p_payroll_run_id, p_created_by)
  on conflict (company_id, payroll_run_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.payroll_run_posting_log
      where company_id = v_company and payroll_run_id = p_payroll_run_id;
    select * into v_run from public.payroll_runs where id = p_payroll_run_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'run', to_jsonb(v_run));
  end if;

  -- LOCK the run — serialises a concurrent post attempt on the same run
  -- (double-click / two tabs / a retried request racing the first).
  select * into v_run from public.payroll_runs
    where id = p_payroll_run_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_payroll_run: payroll run % not found in company', p_payroll_run_id;
  end if;

  -- RE-VALIDATE against the LOCKED row.
  if v_run.status <> 'draft' then
    raise exception 'post_payroll_run: payroll run % has already been posted', v_run.run_number;
  end if;
  if jsonb_array_length(v_run.payslips) = 0 then
    raise exception 'post_payroll_run: payroll run % has no payslip lines to post', v_run.run_number;
  end if;

  -- BANKING FIX: the contra account must be a liability/clearing account,
  -- never Cash and Bank or any asset account — refuses to let a caller
  -- silently smuggle a direct-to-cash posting back in through this
  -- parameter. Net pay is settled later, exactly once, through Banking.
  select * into v_contra from public.accounts where id = p_contra_account_id and company_id = v_company;
  if not found then
    raise exception 'post_payroll_run: contra account % not found in company', p_contra_account_id;
  end if;
  if v_contra.type <> 'liability' then
    raise exception 'post_payroll_run: contra account "%" (%) must be a liability/clearing account (e.g. Net Pay Payable), not %. Net pay is settled later through Banking — a payroll run must never credit Cash and Bank directly.', v_contra.name, v_contra.code, v_contra.type;
  end if;

  -- open accounting period (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_pay_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_payroll_run: no open accounting period covers %', p_pay_date::date;
  end if;

  -- JOURNAL BALANCING: create_journal_entry_with_lines() trusts p_lines as
  -- given (confirmed against the live function definition — no balance
  -- check of its own). A payroll run's combined entry has up to 9 dynamic
  -- lines built in TypeScript from real payslip totals — real dollar risk
  -- if that computation ever drifts — so this function re-verifies the sum
  -- itself rather than inheriting that trust silently.
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'post_payroll_run: lines do not balance (debit % vs credit %)', v_total_debit, v_total_credit;
  end if;

  -- POST the balanced combined journal via the canonical atomic path.
  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_pay_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  update public.payroll_runs
     set status = 'posted',
         journal_entry_id = v_je.id,
         contra_account_id = p_contra_account_id,
         updated_at = now()
   where id = p_payroll_run_id and company_id = v_company
   returning * into v_run;

  update public.payroll_run_posting_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'run', to_jsonb(v_run));
end;
$$;

revoke all on function public.post_payroll_run(
  uuid, timestamptz, text, text, jsonb, uuid, text
) from public, anon;
grant execute on function public.post_payroll_run(
  uuid, timestamptz, text, text, jsonb, uuid, text
) to authenticated;
