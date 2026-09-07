-- 0072_audit_access_log_hardening
-- ADMINISTRATION MODULE · BLOCK C — Audit Trail + Access Log (2026-09-07,
-- branch administration-module-2026-09-06). PRE-MERGE. `main` untouched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- TWO DISTINCT LOGS — kept distinct
--   audit_log_entries  = WHO CHANGED WHAT in the accounting/business system
--                        (append-only business-change evidence).
--   audit_logs_access  = WHO ATTEMPTED TO ACCESS a protected area, and was
--                        it allowed or denied (security / authorization).
--   They are NOT merged.
--
-- THIS MIGRATION
--   1. Immutability — both logs become hard append-only via a BEFORE
--      UPDATE/DELETE trigger that raises. Belt-and-braces over the
--      existing "no UPDATE/DELETE policy → denied" default: even a future
--      mis-scoped policy or a SECURITY DEFINER path cannot rewrite history.
--      Retention/purge, if ever needed, is a deliberate future migration
--      run as the table owner — never an app action.
--   2. Query indexes for the paginated, filtered Audit Trail / Access Log
--      pages — (company_id, time DESC) composites + module / result.
--   3. log_access_event() — the ONE way the app records an access
--      checkpoint. SECURITY DEFINER, actor from auth.uid(), company from
--      get_my_company_id(), with server-side de-duplication so a page
--      refresh or a re-render never adds a second row.
--   4. audit_logs_access SELECT widened to the finance roles that the
--      `audit` permission feature already grants the page to
--      (accountant, finance_manager) — additive, no lockout.


-- ─────────────────────────────────────────────────────────────────────
-- 1. IMMUTABILITY
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.reject_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only — audit history cannot be modified or deleted', tg_table_name
    using errcode = '42501';
end;
$$;

revoke all on function public.reject_audit_mutation() from public, anon, authenticated;

drop trigger if exists audit_log_entries_no_mutation on public.audit_log_entries;
create trigger audit_log_entries_no_mutation
  before update or delete on public.audit_log_entries
  for each row execute function public.reject_audit_mutation();

drop trigger if exists audit_logs_access_no_mutation on public.audit_logs_access;
create trigger audit_logs_access_no_mutation
  before update or delete on public.audit_logs_access
  for each row execute function public.reject_audit_mutation();


-- ─────────────────────────────────────────────────────────────────────
-- 2. INDEXES — the real page query shapes
-- ─────────────────────────────────────────────────────────────────────
create index if not exists audit_log_entries_company_created_idx
  on public.audit_log_entries (company_id, created_at desc);
create index if not exists audit_log_entries_company_module_idx
  on public.audit_log_entries (company_id, module);
create index if not exists audit_log_entries_company_user_idx
  on public.audit_log_entries (company_id, user_id);

create index if not exists audit_logs_access_company_occurred_idx
  on public.audit_logs_access (company_id, occurred_at desc);
create index if not exists audit_logs_access_company_result_idx
  on public.audit_logs_access (company_id, result);


-- ─────────────────────────────────────────────────────────────────────
-- 3. log_access_event() — the controlled access-checkpoint writer
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.log_access_event(
  p_action        text,
  p_area          text,
  p_result        text,
  p_detail        jsonb    default '{}'::jsonb,
  p_dedupe_window interval default interval '1 hour'
) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_company uuid := (select public.get_my_company_id());
begin
  if v_uid is null then
    return; -- no session, nothing to attribute
  end if;
  if p_result not in ('allowed', 'denied_rls', 'denied_permission') then
    raise exception 'log_access_event: invalid result %', p_result using errcode = '22023';
  end if;
  if coalesce(btrim(p_action), '') = '' or coalesce(btrim(p_area), '') = '' then
    raise exception 'log_access_event: action and area are required' using errcode = '22023';
  end if;

  -- De-dupe: the same actor hitting the same checkpoint with the same
  -- result inside the window is one event, not many. Keeps a page refresh
  -- or a re-mount from flooding the log.
  if exists (
    select 1 from public.audit_logs_access
    where actor_id = v_uid
      and action = p_action
      and table_name = p_area
      and result = p_result
      and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(v_company, '00000000-0000-0000-0000-000000000000'::uuid)
      and occurred_at > now() - p_dedupe_window
  ) then
    return;
  end if;

  insert into public.audit_logs_access (actor_id, action, table_name, company_id, result, detail)
  values (v_uid, btrim(p_action), btrim(p_area), v_company, p_result,
          coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all     on function public.log_access_event(text, text, text, jsonb, interval) from public;
revoke execute on function public.log_access_event(text, text, text, jsonb, interval) from anon;
grant  execute on function public.log_access_event(text, text, text, jsonb, interval) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 4. audit_logs_access SELECT — add the finance roles the page is granted to
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists audit_logs_access_select on public.audit_logs_access;
create policy audit_logs_access_select on public.audit_logs_access
  for select to authenticated
  using (
    (
      company_id = (select public.get_my_company_id())
      and public.get_my_role() in ('admin', 'accountant', 'manager')
    )
    or public.get_my_role() = 'superuser'
  );


-- ─────────────────────────────────────────────────────────────────────
-- 5. Observability
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.log_access_event(text, text, text, jsonb, interval)') is null then
    raise exception '0072: log_access_event missing';
  end if;
  if has_function_privilege('anon', 'public.log_access_event(text, text, text, jsonb, interval)', 'execute') then
    raise exception '0072: log_access_event must not be anon-executable';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'audit_log_entries_no_mutation') then
    raise exception '0072: audit_log_entries immutability trigger missing';
  end if;
  raise notice '0072: OK — audit immutability + indexes + log_access_event + widened access-log read.';
end $$;
