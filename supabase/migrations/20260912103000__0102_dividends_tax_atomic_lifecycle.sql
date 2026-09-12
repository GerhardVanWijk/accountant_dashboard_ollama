-- 0102_dividends_tax_atomic_lifecycle
-- Tax & Compliance integrity audit, continuation (2026-09-12). AUTHORED, NOT APPLIED.
-- Apply AFTER 0007 (dividend_declarations / dividends_withholding_tax_configs)
-- and 0033 (create_journal_entry_with_lines).
--
-- Same defect class as 0099 (Income Tax) / 0101 (Provisional Tax):
-- `DividendDeclarationService.declare()`/`pay()`/`remitToSars()` each posted
-- a journal, then SEPARATELY updated `dividend_declarations.status` plus
-- the transition's own journal-entry-id/date column — two independently-
-- committing writes per transition, three transitions per declaration. A
-- failure between the two writes of any ONE transition leaves a real
-- posted GL journal with the declaration still showing its PRIOR status,
-- and a retry posts a SECOND journal for that same transition.
--
-- SCOPE: TypeScript (dividendDeclarationService.ts) still owns every
-- policy decision — withholding computation, exemption validation, which
-- lines to post per transition. These functions perform NO tax
-- arithmetic; they take the already-computed lines and either commit the
-- whole transition event (journal + status flip + traceability columns)
-- or roll all of it back. Accounting stays exactly as already supported:
-- declare = DR Retained Earnings / CR Dividends Payable; pay = DR
-- Dividends Payable / CR Cash and Bank (net) / CR Dividends Tax Payable
-- (withheld); remit = DR Dividends Tax Payable / CR Cash and Bank. A
-- dividend is never classified as an operating expense.
--
-- IDEMPOTENCY / CONCURRENCY:
--   * ONE shared `dividend_declaration_posting_log`, keyed
--     (company_id, dividend_declaration_id, transition) where
--     transition in ('declare','pay','remit') — a single declaration
--     undergoes three distinct, sequential posting events over its
--     lifetime (unlike a tax computation, which posts once ever), so the
--     idempotency key must distinguish which transition a retry is
--     retrying, not just which declaration.
--   * Each function LOCKS the dividend_declarations row FOR UPDATE and
--     re-validates the REQUIRED PRIOR status against the LOCKED row
--     (declare requires 'draft', pay requires 'declared', remit requires
--     'paid') — two concurrent calls to the SAME transition on the SAME
--     declaration serialise on that lock; the second sees the status
--     already advanced (or the posting-log's UNIQUE constraint, whichever
--     fires first) and returns the FIRST call's result.
--   * `p_lines` empty (remit() on a fully-exempt declaration — nothing
--     withheld) skips the journal entirely and just flips status —
--     matches DividendDeclarationService.remitToSars()'s existing
--     "no degenerate zero-value entry" behaviour exactly.
--
-- STATUTORY CONFIG TRACEABILITY (§13, companion to this migration):
-- `dividend_declarations.withholding_tax_config_id` is added as a
-- NULLABLE snapshot FK to the exact `dividends_withholding_tax_configs`
-- row that produced `rate_percent_applied` at draft-creation/edit time —
-- mirrors `vat_source_entries.tax_rate_id` (migration 0080)'s "record the
-- authoritative reference, not just the resolved number" precedent.
-- Nullable (not backfilled) because this table may already hold rows in
-- production created before this column existed; this migration does not
-- touch existing data. New/edited drafts populate it going forward via
-- `DividendDeclarationService.computeFields()`. This column is NOT
-- written by the RPCs below — it is set by the existing draft-create/
-- update path before a declaration ever reaches `declare()`.

alter table public.dividend_declarations
  add column if not exists withholding_tax_config_id uuid references public.dividends_withholding_tax_configs(id);

create index if not exists dividend_declarations_withholding_tax_config_id_idx
  on public.dividend_declarations (withholding_tax_config_id);

create table public.dividend_declaration_posting_log (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references public.companies(id) on delete cascade,
  dividend_declaration_id   uuid not null,
  transition                text not null check (transition in ('declare', 'pay', 'remit')),
  journal_entry_id          uuid references public.journal_entries(id),
  created_by                text,
  created_at                timestamptz not null default now(),
  unique (company_id, dividend_declaration_id, transition)
);

create index dividend_declaration_posting_log_company_id_idx
  on public.dividend_declaration_posting_log (company_id);

alter table public.dividend_declaration_posting_log enable row level security;

create policy dividend_declaration_posting_log_all_own_company
  on public.dividend_declaration_posting_log for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- ============================================================================
-- Shared helper: the actual atomic executor, parameterised by transition,
-- required prior status, and next status. All three public RPCs below are
-- thin wrappers over this so the locking/idempotency/balance-check logic
-- exists exactly once, not three times with the copy-paste drift risk
-- that implies.
-- ============================================================================
create or replace function public._post_dividend_transition(
  p_transition       text,
  p_required_status  text,
  p_next_status      text,
  p_declaration_id   uuid,
  p_date             timestamptz,
  p_memo             text,
  p_source           text,
  p_lines            jsonb,
  p_posted_by        text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_company       uuid := (select public.get_my_company_id());
  v_log_id        uuid;
  v_existing      public.dividend_declaration_posting_log;
  v_declaration   public.dividend_declarations;
  v_je            public.journal_entries;
  v_total_debit   numeric;
  v_total_credit  numeric;
begin
  if v_company is null then
    raise exception '_post_dividend_transition: no company context';
  end if;
  if not public.has_permission('tax', 'post') then
    raise exception '%_dividend: missing required permission tax:post', p_transition using errcode = '42501';
  end if;
  if p_declaration_id is null then
    raise exception '_post_dividend_transition: declaration_id is required';
  end if;

  -- DEFECT FOUND IN REVIEW (§5 — "helper cannot be invoked to bypass valid
  -- lifecycle transitions"): this helper's EXECUTE grant CANNOT be revoked
  -- from `authenticated` the way its doc comment intends — declare_dividend/
  -- pay_dividend/remit_dividend_to_sars are SECURITY INVOKER, so their
  -- nested call to this function runs AS the calling `authenticated` user;
  -- revoking `authenticated`'s EXECUTE here (as originally authored) would
  -- make every wrapper call fail with "permission denied for function
  -- _post_dividend_transition" for every user, always — a fact that never
  -- surfaced because this codebase's unit tests mock the RPC layer rather
  -- than exercising a live Postgres grant. So `authenticated` MUST retain
  -- EXECUTE here (see the grant below) — which means a client CAN invoke
  -- this helper directly, with arbitrary (p_transition, p_required_status,
  -- p_next_status). This allow-list is therefore the ACTUAL enforcement
  -- that a caller cannot request an invalid transition (e.g. skipping
  -- straight from 'draft' to 'remitted') — not the revoke, which cannot do
  -- that job for a SECURITY INVOKER wrapper chain.
  if (p_transition, p_required_status, p_next_status) not in (
    ('declare', 'draft', 'declared'),
    ('pay', 'declared', 'paid'),
    ('remit', 'paid', 'remitted')
  ) then
    raise exception '_post_dividend_transition: "%" (% -> %) is not a recognised dividend lifecycle transition', p_transition, p_required_status, p_next_status;
  end if;

  -- IDEMPOTENCY on (declaration, transition) — NOT the declaration alone.
  insert into public.dividend_declaration_posting_log (company_id, dividend_declaration_id, transition, created_by)
  values (v_company, p_declaration_id, p_transition, p_posted_by)
  on conflict (company_id, dividend_declaration_id, transition) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    select * into v_existing from public.dividend_declaration_posting_log
      where company_id = v_company and dividend_declaration_id = p_declaration_id and transition = p_transition;
    select * into v_declaration from public.dividend_declarations
      where id = p_declaration_id and company_id = v_company;
    return jsonb_build_object(
      'idempotent', true,
      'journal_entry_id', v_existing.journal_entry_id,
      'declaration', to_jsonb(v_declaration));
  end if;

  -- LOCK the declaration — serialises a concurrent call to the SAME transition.
  select * into v_declaration from public.dividend_declarations
    where id = p_declaration_id and company_id = v_company
    for update;
  if not found then
    raise exception '%_dividend: dividend declaration % not found in company', p_transition, p_declaration_id;
  end if;

  -- RE-VALIDATE the required prior status against the LOCKED row.
  if v_declaration.status <> p_required_status then
    raise exception '%_dividend: dividend declaration % has status "%", expected "%"', p_transition, p_declaration_id, v_declaration.status, p_required_status;
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    -- Nothing to post to the GL (e.g. remit() on a fully-exempt declaration) — just flip status.
    update public.dividend_declarations
       set status = p_next_status,
           paid_date = case when p_transition = 'pay' then p_date else paid_date end,
           remitted_date = case when p_transition = 'remit' then p_date else remitted_date end,
           updated_at = now()
     where id = p_declaration_id and company_id = v_company
     returning * into v_declaration;

    update public.dividend_declaration_posting_log set journal_entry_id = null where id = v_log_id;
    return jsonb_build_object('idempotent', false, 'journal_entry_id', null, 'declaration', to_jsonb(v_declaration));
  end if;

  -- Open accounting period check (create_journal_entry_with_lines does not check).
  if not exists (
    select 1 from public.accounting_periods p
    where p.company_id = v_company and p.status = 'open'
      and p_date::date between p.start_date and p.end_date
  ) then
    raise exception '%_dividend: no open accounting period covers %', p_transition, p_date::date;
  end if;

  -- JOURNAL BALANCING: re-verify the sum rather than inheriting create_journal_entry_with_lines()'s trust silently.
  select coalesce(sum((l ->> 'debit')::numeric), 0), coalesce(sum((l ->> 'credit')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(p_lines) l;
  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception '%_dividend: lines do not balance (debit % vs credit %)', p_transition, v_total_debit, v_total_credit;
  end if;

  -- BANKING FIX (migration-review addendum, §3 — duplicate-post risk):
  -- reject a line that touches a bank account's OWN GL account directly.
  -- pay()'s net-to-shareholders leg and remit()'s SARS leg must both
  -- credit the Dividends Payment Clearing account (code 2520, migration
  -- 0107) instead — the real EFT (to shareholders, or to SARS) is
  -- recorded exactly once, later, through the existing Banking module.
  -- Same fix, same reasoning as post_payroll_run (0091) /
  -- post_lease_amortization_period (0089).
  if exists (
    select 1
    from jsonb_array_elements(p_lines) l
    join public.bank_accounts ba
      on ba.gl_account_id = (l ->> 'account_id')::uuid and ba.company_id = v_company
  ) then
    raise exception '%_dividend: a line posts directly to a bank account''s GL account — credit the Dividends Payment Clearing account (2520) instead; the actual EFT is recorded once, later, through Banking.', p_transition;
  end if;

  v_je := public.create_journal_entry_with_lines(
    v_company, '', p_date, p_memo, 'posted', now(), null, p_source, null, p_lines
  );

  update public.dividend_declarations
     set status = p_next_status,
         declaration_journal_entry_id = case when p_transition = 'declare' then v_je.id else declaration_journal_entry_id end,
         payment_journal_entry_id     = case when p_transition = 'pay' then v_je.id else payment_journal_entry_id end,
         paid_date                    = case when p_transition = 'pay' then p_date else paid_date end,
         remittance_journal_entry_id  = case when p_transition = 'remit' then v_je.id else remittance_journal_entry_id end,
         remitted_date                = case when p_transition = 'remit' then p_date else remitted_date end,
         updated_at = now()
   where id = p_declaration_id and company_id = v_company
   returning * into v_declaration;

  update public.dividend_declaration_posting_log set journal_entry_id = v_je.id where id = v_log_id;

  return jsonb_build_object('idempotent', false, 'journal_entry_id', v_je.id, 'declaration', to_jsonb(v_declaration));
end;
$$;

-- FIX (see the DEFECT FOUND IN REVIEW comment above): `authenticated` MUST
-- keep EXECUTE here for the three SECURITY INVOKER wrappers below to be
-- able to call this at all — the transition allow-list added above (not
-- this grant) is what stops a direct call from bypassing a valid
-- lifecycle transition.
revoke all on function public._post_dividend_transition(
  text, text, text, uuid, timestamptz, text, text, jsonb, text
) from public, anon;
grant execute on function public._post_dividend_transition(
  text, text, text, uuid, timestamptz, text, text, jsonb, text
) to authenticated;

-- ============================================================================
-- Public RPCs — one per transition, each a fixed-parameter wrapper so the
-- client never chooses `p_transition`/`p_required_status`/`p_next_status`
-- itself (those are policy, not caller input).
-- ============================================================================
create or replace function public.declare_dividend(
  p_dividend_declaration_id uuid,
  p_date       timestamptz,
  p_memo       text,
  p_source     text,
  p_lines      jsonb,
  p_posted_by  text
) returns jsonb
language sql
security invoker
set search_path to 'public'
as $$
  select public._post_dividend_transition('declare', 'draft', 'declared', p_dividend_declaration_id, p_date, p_memo, p_source, p_lines, p_posted_by);
$$;

create or replace function public.pay_dividend(
  p_dividend_declaration_id uuid,
  p_date       timestamptz,
  p_memo       text,
  p_source     text,
  p_lines      jsonb,
  p_posted_by  text
) returns jsonb
language sql
security invoker
set search_path to 'public'
as $$
  select public._post_dividend_transition('pay', 'declared', 'paid', p_dividend_declaration_id, p_date, p_memo, p_source, p_lines, p_posted_by);
$$;

create or replace function public.remit_dividend_to_sars(
  p_dividend_declaration_id uuid,
  p_date       timestamptz,
  p_memo       text,
  p_source     text,
  p_lines      jsonb,
  p_posted_by  text
) returns jsonb
language sql
security invoker
set search_path to 'public'
as $$
  select public._post_dividend_transition('remit', 'paid', 'remitted', p_dividend_declaration_id, p_date, p_memo, p_source, p_lines, p_posted_by);
$$;

revoke all on function public.declare_dividend(uuid, timestamptz, text, text, jsonb, text) from public, anon;
revoke all on function public.pay_dividend(uuid, timestamptz, text, text, jsonb, text) from public, anon;
revoke all on function public.remit_dividend_to_sars(uuid, timestamptz, text, text, jsonb, text) from public, anon;
grant execute on function public.declare_dividend(uuid, timestamptz, text, text, jsonb, text) to authenticated;
grant execute on function public.pay_dividend(uuid, timestamptz, text, text, jsonb, text) to authenticated;
grant execute on function public.remit_dividend_to_sars(uuid, timestamptz, text, text, jsonb, text) to authenticated;
