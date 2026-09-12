-- 0099_income_tax_atomic_posting
-- Tax & Compliance integrity audit (2026-09-12). AUTHORED, NOT APPLIED.
-- Apply AFTER 0007 (tax_computations) and 0033 (create_journal_entry_with_lines).
--
-- Before this migration, `TaxComputationService.postComputation()` made 2
-- separate, independently-committing writes (post the DR Income Tax
-- Expense / CR Income Tax Payable journal via create_journal_entry_with_lines,
-- then a second UPDATE on `tax_computations` setting status='posted' +
-- journal_entry_id). A failure between them — the tab closing, the network
-- dropping, the Supabase call timing out after the INSERT committed but
-- before the second UPDATE round-trip started — leaves a real posted GL
-- journal (Income Tax Expense/Payable actually moved) with the computation
-- still showing 'draft'. Because `createComputation()`'s only guard is "one
-- computation per financial year" (not "one journal per computation"), the
-- user simply retries "Post Tax Computation" and a SECOND journal entry is
-- posted for the same year's liability — Income Tax Expense and Income Tax
-- Payable are now double-counted on the GL, silently, with no error and no
-- visible sign in the Income Tax page (which only ever shows ONE
-- `TaxComputation` row, now pointing at only the LATER of the two journals
-- — the earlier one is an orphan, invisible to this module, still sitting
-- in the trial balance).
--
-- Same defect class the Leases + Payroll integrity audit found and fixed
-- for `payroll_runs` (migration 0091, `post_payroll_run`) and Fixed Assets
-- found and fixed for disposals/depreciation (0081, 0083). This migration
-- applies the identical pattern to Income Tax. The companion TypeScript
-- change (`taxComputationPostingExecutor.ts`) already calls this RPC;
-- until this migration is applied, `RealTaxComputationPostingExecutor`
-- will fail with "function post_income_tax_computation does not exist" —
-- apply together.
--
-- SCOPE: TypeScript (taxComputationService.ts) still owns every policy
-- decision — accounting-profit computation, adjustments, taxable income,
-- tax liability, which two lines to post. This function performs NO tax
-- arithmetic; it takes the already-computed lines and either commits the
-- whole posting event (journal + status flip) or rolls all of it back.
--
-- IDEMPOTENCY / CONCURRENCY:
--   * `income_tax_computation_posting_log` — UNIQUE (company_id,
--     tax_computation_id). A computation posts at most once, ever
--     (createComputation()'s per-financial-year guard is the structural
--     backstop), so the idempotency key is the computation's own stable
--     id — no separate caller-generated token needed, same reasoning as
--     0091's payroll_run_posting_log.
--   * The function LOCKS the tax_computations row FOR UPDATE and
--     re-validates status='draft' against the LOCKED row — two concurrent
--     post attempts on the same computation (double-click / two tabs)
--     serialise on that lock; the second sees status = 'posted' (or the
--     posting-log's UNIQUE constraint, whichever fires first) and returns
--     the FIRST call's result instead of posting a second journal.
--   * `p_lines` empty (nil-liability computation) skips the journal
--     entirely and just flips status — matches
--     TaxComputationService.postComputation()'s existing "no journal for a
--     zero liability" behaviour exactly.

create table public.income_tax_computation_posting_log (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  tax_computation_id    uuid not null,
  journal_entry_id      uuid references public.journal_entries(id),
  created_by            text,
  created_at            timestamptz not null default now(),
  unique (company_id, tax_computation_id)
);

create index income_tax_computation_posting_log_company_id_idx
  on public.income_tax_computation_posting_log (company_id);

alter table public.income_tax_computation_posting_log enable row level security;

create policy income_tax_computation_posting_log_all_own_company
  on public.income_tax_computation_posting_log for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ============================================================================
-- AUTHORIZATION HELPER (migration-review addendum, §2 — "UI useCanAccess()
-- is NOT authorization"). Confirmed live: every RLS policy on every table
-- this migration set touches is a plain `for all to authenticated using
-- (company_id = get_my_company_id())` — company isolation only, no role or
-- permission check whatsoever. The fine-grained permissions/role_permissions/
-- user_roles catalog (Phase T, migrations 0010/0030/0064) exists and is
-- populated, but until now was read ONLY by the frontend
-- (usePermission()/useCanAccess()) — that hook's own doc comment says so
-- explicitly: "This hides/shows UI only. It does NOT restrict what the ~45
-- pre-existing tables' RLS actually allows." Before this function, ANY
-- authenticated member of a company — regardless of role or fine-grained
-- permission, including one holding only `tax:read` — could call
-- post_income_tax_computation / pay_provisional_tax / declare_dividend /
-- pay_dividend / remit_dividend_to_sars / post_deferred_tax_computation /
-- post_ecl_computation directly via a Supabase RPC call (one HTTP request
-- away from any authenticated session, entirely independent of which
-- buttons the UI happens to show that user) and post a real GL transaction.
--
-- This enforces the SAME EXISTING catalog server-side — it does NOT invent
-- a parallel authorization model: 'admin'/'superuser' (profiles.role)
-- bypass unconditionally, exactly matching useCanAccess()'s own bypass
-- rule; everyone else must hold an explicit (feature, action) grant via
-- user_roles -> role_permissions -> permissions for THEIR OWN company
-- (ur.company_id = get_my_company_id() — a cross-company role assignment,
-- which enforce_user_role_company_integrity already forbids from ever
-- being created, is never trusted regardless).
--
-- SCOPE: general-purpose, not tax-specific, but only called from this
-- migration set's RPCs. The identical gap exists on every other posting
-- RPC this codebase has ever shipped (post_payroll_run,
-- post_asset_depreciation_period, post_lease_amortization_period,
-- settle_payroll_net_pay, etc. — migrations 0081-0097) — closing it there
-- too is a recommended follow-up hardening pass, flagged in the audit's
-- final report, out of scope for this migration set.
create or replace function public.has_permission(p_feature text, p_action text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when public.get_my_role() in ('admin', 'superuser') then true
    else exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id and rp.granted = true
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = (select auth.uid())
        and ur.company_id = (select public.get_my_company_id())
        and p.feature = p_feature
        and p.action = p_action
    )
  end
$$;

revoke all on function public.has_permission(text, text) from public, anon;
grant execute on function public.has_permission(text, text) to authenticated;

create or replace function public.post_income_tax_computation(
  p_tax_computation_id uuid,
  p_date               timestamptz,
  p_memo               text,
  p_source             text,
  p_lines              jsonb,
  p_posted_by          text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company       uuid := (select public.get_my_company_id());
  v_log_id        uuid;
  v_existing      public.income_tax_computation_posting_log;
  v_computation   public.tax_computations;
  v_je            public.journal_entries;
  v_total_debit   numeric;
  v_total_credit  numeric;
begin
  if v_company is null then
    raise exception 'post_income_tax_computation: no company context';
  end if;
  if not public.has_permission('tax', 'post') then
    raise exception 'post_income_tax_computation: missing required permission tax:post' using errcode = '42501';
  end if;
  if p_tax_computation_id is null then
    raise exception 'post_income_tax_computation: tax_computation_id is required';
  end if;

  -- IDEMPOTENCY on the computation's own STABLE id.
  insert into public.income_tax_computation_posting_log (company_id, tax_computation_id, created_by)
  values (v_company, p_tax_computation_id, p_posted_by)
  on conflict (company_id, tax_computation_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.income_tax_computation_posting_log
      where company_id = v_company and tax_computation_id = p_tax_computation_id;
    select * into v_computation from public.tax_computations
      where id = p_tax_computation_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'computation', to_jsonb(v_computation));
  end if;

  -- LOCK the computation — serialises a concurrent post attempt (double-click / two tabs / a retried request racing the first).
  select * into v_computation from public.tax_computations
    where id = p_tax_computation_id and company_id = v_company
    for update;
  if not found then
    raise exception 'post_income_tax_computation: tax computation % not found in company', p_tax_computation_id;
  end if;

  -- RE-VALIDATE against the LOCKED row.
  if v_computation.status <> 'draft' then
    raise exception 'post_income_tax_computation: tax computation for "%" has already been posted', v_computation.financial_year_label;
  end if;

  -- Open accounting period check (create_journal_entry_with_lines does not check).
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 0 and not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception 'post_income_tax_computation: no open accounting period covers %', p_date::date;
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    -- Nil-liability computation: nothing to post to the GL, just flip status.
    update public.tax_computations
       set status = 'posted',
           posted_at = now(),
           posted_by_user_id = p_posted_by,
           updated_at = now()
     where id = p_tax_computation_id and company_id = v_company
     returning * into v_computation;

    update public.income_tax_computation_posting_log set journal_entry_id = null where id = v_log_id;

    return jsonb_build_object('idempotent', false, 'journal_entry_id', null, 'computation', to_jsonb(v_computation));
  end if;

  -- JOURNAL BALANCING: create_journal_entry_with_lines() trusts p_lines as
  -- given — re-verify the sum here rather than inheriting that trust
  -- silently (same defensive check 0091's post_payroll_run added).
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'post_income_tax_computation: lines do not balance (debit % vs credit %)', v_total_debit, v_total_credit;
  end if;

  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  update public.tax_computations
     set status = 'posted',
         journal_entry_id = v_je.id,
         posted_at = now(),
         posted_by_user_id = p_posted_by,
         updated_at = now()
   where id = p_tax_computation_id and company_id = v_company
   returning * into v_computation;

  update public.income_tax_computation_posting_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'computation', to_jsonb(v_computation));
end;
$$;

revoke all on function public.post_income_tax_computation(
  uuid, timestamptz, text, text, jsonb, text
) from public, anon;
grant execute on function public.post_income_tax_computation(
  uuid, timestamptz, text, text, jsonb, text
) to authenticated;
