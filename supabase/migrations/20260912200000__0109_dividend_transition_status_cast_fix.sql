-- 0109_dividend_transition_status_cast_fix
-- Tax & Compliance integrity audit — production release smoke-test finding
-- (2026-09-12). Apply AFTER 0102 (dividends_tax_atomic_lifecycle) and 0107
-- (already applied).
--
-- DEFECT FOUND DURING RELEASE SMOKE TESTING (rollback-wrapped, live, against
-- the applied 0102 function): `_post_dividend_transition` compares
-- `v_declaration.status` (the `dividend_declaration_status` enum column)
-- against `p_required_status`, a plain `text` PARAMETER, with `<>`:
--
--   if v_declaration.status <> p_required_status then
--
-- Postgres has no implicit operator resolving `dividend_declaration_status
-- <> text` for a plpgsql VARIABLE (unlike an untyped string LITERAL, which
-- Postgres infers the type of from context — the reason `v_computation.status
-- <> 'draft'` in 0099/0101/0103/0104's sibling functions works fine). The
-- first real call to `declare_dividend()` — proven live during this
-- release's smoke test, mirroring every OTHER RPC's `p_status::public.xxx`
-- explicit-cast convention already used by `create_journal_entry_with_lines`
-- — failed outright with:
--
--   ERROR: operator does not exist: dividend_declaration_status <> text
--
-- i.e. `declare_dividend`/`pay_dividend`/`remit_dividend_to_sars` would have
-- failed for every real call, on every environment, the same class of "only
-- a live database catches this" gap the grant/invoker defect found during
-- the earlier migration review also was. 0102's own applied file is left
-- alone (already applied to production; rewriting an applied migration's
-- history is not this codebase's convention — see 0091b/0091c, 0097b/0097c
-- for the identical "numbered follow-up over rewriting an applied file"
-- precedent) — this migration is a `create or replace` of the SAME function
-- signature with the enum casts added, no other line changed.
--
-- FIX: explicit `::public.dividend_declaration_status` casts on
-- `p_required_status` (the comparison) and `p_next_status` (both status
-- assignments) — mirrors `create_journal_entry_with_lines`'s own
-- `p_status::public.journal_entry_status` cast for the identical reason.

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

  -- Transition allow-list (see 0102's own "DEFECT FOUND IN REVIEW" comment —
  -- `authenticated` must keep EXECUTE on this helper for the SECURITY
  -- INVOKER wrapper chain to work at all, so this allow-list, not the
  -- grant, is what stops a direct call from requesting an invalid transition).
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
  -- DEFECT FIX (0109): explicit cast — dividend_declaration_status has no
  -- implicit <> operator against a plain text VARIABLE (only against an
  -- untyped string literal, which is why the sibling posting RPCs' literal
  -- comparisons never hit this).
  if v_declaration.status <> p_required_status::public.dividend_declaration_status then
    raise exception '%_dividend: dividend declaration % has status "%", expected "%"', p_transition, p_declaration_id, v_declaration.status, p_required_status;
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    -- Nothing to post to the GL (e.g. remit() on a fully-exempt declaration) — just flip status.
    update public.dividend_declarations
       set status = p_next_status::public.dividend_declaration_status,
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
     set status = p_next_status::public.dividend_declaration_status,
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

-- Same grant posture as 0102 — unchanged by this fix, restated so this
-- migration is self-contained (CREATE OR REPLACE FUNCTION does not reset
-- existing grants, but stating them again documents intent and is a no-op
-- if already correct).
revoke all on function public._post_dividend_transition(
  text, text, text, uuid, timestamptz, text, text, jsonb, text
) from public, anon;
grant execute on function public._post_dividend_transition(
  text, text, text, uuid, timestamptz, text, text, jsonb, text
) to authenticated;

do $$
begin
  if to_regprocedure('public._post_dividend_transition(text, text, text, uuid, timestamptz, text, text, jsonb, text)') is null then
    raise exception '0109: _post_dividend_transition was not created';
  end if;
end $$;
