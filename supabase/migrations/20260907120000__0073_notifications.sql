-- 0073_notifications
-- ADMINISTRATION MODULE · BLOCK D — Global Notifications (2026-09-07,
-- branch administration-module-2026-09-06). PRE-MERGE. `main` untouched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- WHAT THIS IS
--   A workspace notification subsystem for ATTENTION-WORTHY conditions
--   only — ACTION REQUIRED / RISK / DEADLINE / EXCEPTION / FAILURE /
--   SECURITY / MATERIAL VARIANCE. It is NOT an accounting activity feed:
--   routine postings (bank transactions, invoices, receipts, journals,
--   stock movements, logins, ordinary CRUD) DO NOT create a notification —
--   those belong in their own modules and in the Audit Trail (0072).
--
-- LIFECYCLE (condition-driven, not event-driven)
--   condition appears  -> a notification row opens (status 'open')
--   condition persists  -> the SAME row stays open; only last_seen_at moves
--   condition resolves  -> the row is auto-resolved (status 'resolved')
--   condition returns   -> the row re-opens with event_seq + 1 (a fresh
--                          lifecycle: it counts as unread again)
--   Every condition has a STABLE dedupe_key, unique per (company, key), so
--   a page refresh or a re-evaluation never adds a duplicate.
--
-- THE ENGINE
--   public.evaluate_company_notifications() runs a fixed set of
--   deterministic checks against REAL data (documents, reconciliation
--   issues, subscriptions, the access log, accounting periods, AR,
--   inventory, budgets), upserts the active conditions, and auto-resolves
--   any open notification whose condition is no longer present. It invents
--   nothing: a check with no qualifying rows produces no notification.
--
-- TARGETING
--   target_roles       null = every member of the company; else a set of
--                      profile_role labels (admin/superuser always included)
--   target_permission  null, or 'feature:action' from the fine-grained
--                      catalog (admin/superuser bypass)
--   target_entitlement null, or a subscription-feature key — if the company
--                      is not entitled to the module, nobody sees it
--
-- PER-USER STATE
--   notification_reads  read/unread is per user and per event_seq, so a
--                       re-opened condition is unread again.
--   notification_mutes  a user may mute a NON-CRITICAL category; a
--                       'critical'-severity item is shown regardless.
--
-- SECURITY
--   Strict company isolation on every table. `notifications` has NO
--   client write policy at all — only the SECURITY DEFINER engine writes.
--   Reads, mark-read and mute all go through SECURITY DEFINER RPCs that
--   re-check visibility.


-- ─────────────────────────────────────────────────────────────────────
-- 1. TABLES
-- ─────────────────────────────────────────────────────────────────────
create table public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  dedupe_key         text not null check (btrim(dedupe_key) <> '' and char_length(dedupe_key) <= 200),
  category           text not null check (category in (
                       'document_expiry','bank_reconciliation','subscription','security',
                       'deadline','tax_deadline','receivable_overdue','inventory_integrity',
                       'budget_variance','workflow_failure')),
  severity           text not null check (severity in ('critical','warning','info')),
  source_module      text not null check (btrim(source_module) <> '' and char_length(source_module) <= 40),
  title              text not null check (btrim(title) <> '' and char_length(title) <= 200),
  body               text check (body is null or char_length(body) <= 1000),
  action_url         text check (action_url is null or action_url like '/%'),
  source_record_type text,
  source_record_id   text,
  status             text not null default 'open' check (status in ('open','resolved')),
  event_seq          integer not null default 1 check (event_seq >= 1),
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  resolved_at        timestamptz,
  resolution         text check (resolution is null or resolution in ('condition_cleared','manual')),
  target_roles       text[],
  target_permission  text check (target_permission is null or target_permission like '%:%'),
  target_entitlement text,
  metadata           jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now(),
  unique (company_id, dedupe_key)
);

create index notifications_company_status_idx on public.notifications (company_id, status, last_seen_at desc);
create index notifications_company_severity_idx on public.notifications (company_id, severity) where status = 'open';

comment on table public.notifications is
  'Attention-worthy workspace conditions (ACTION REQUIRED / RISK / DEADLINE / EXCEPTION / FAILURE / SECURITY / MATERIAL VARIANCE). Condition-driven lifecycle keyed on (company_id, dedupe_key). NOT an accounting activity feed — routine postings never appear here. Written only by evaluate_company_notifications(). See migration 0073.';

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  read_event_seq  integer not null check (read_event_seq >= 1),
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index notification_reads_user_idx on public.notification_reads (user_id);

create table public.notification_mutes (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  category  text not null,
  muted_at  timestamptz not null default now(),
  primary key (user_id, category)
);

-- Categories a user is allowed to mute. Security / subscription / deadline /
-- tax and reconciliation stay always-on; a 'critical'-severity item in a
-- muteable category is still shown (see notification_feed).
create or replace function public.notification_muteable_category(p_category text) returns boolean
language sql immutable set search_path = '' as $$
  select p_category in ('inventory_integrity','budget_variance','receivable_overdue','document_expiry');
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 2. VISIBILITY HELPER
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.notification_visible(
  p_company_id        uuid,
  p_target_roles      text[],
  p_target_permission text,
  p_target_entitlement text
) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select
    p_company_id = (select public.get_my_company_id())
    and (
      p_target_roles is null
      or (select public.get_my_role())::text = any (p_target_roles)
      or (select public.get_my_role()) in ('admin','superuser')
    )
    and (
      p_target_permission is null
      or (select public.get_my_role()) in ('admin','superuser')
      or exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id and rp.granted
        join public.permissions pm on pm.id = rp.permission_id
        where ur.user_id = (select auth.uid())
          and pm.feature = split_part(p_target_permission, ':', 1)
          and pm.action  = split_part(p_target_permission, ':', 2)
      )
    )
    and (
      p_target_entitlement is null
      or public.company_has_entitlement(p_target_entitlement)
    );
$$;

revoke all     on function public.notification_visible(uuid, text[], text, text) from public;
revoke execute on function public.notification_visible(uuid, text[], text, text) from anon;
grant  execute on function public.notification_visible(uuid, text[], text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_mutes enable row level security;

-- notifications: READ only, and only what targets you. No insert/update/
-- delete policy exists -> clients can never write. The engine is SECURITY
-- DEFINER and bypasses RLS.
create policy notifications_select on public.notifications
  for select to authenticated
  using (public.notification_visible(company_id, target_roles, target_permission, target_entitlement));

-- reads / mutes: strictly your own rows (written via the RPCs below).
create policy notification_reads_select on public.notification_reads
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_mutes_all on public.notification_mutes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ─────────────────────────────────────────────────────────────────────
-- 4. THE ENGINE — evaluate_company_notifications()
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.evaluate_company_notifications(p_company_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_company  uuid;
  v_opened   int := 0;
  v_resolved int := 0;
  v_active   int := 0;
begin
  if p_company_id is not null then
    if (select public.get_my_role()) is distinct from 'superuser' then
      raise exception 'evaluate_company_notifications: only a superuser may evaluate another company'
        using errcode = '42501';
    end if;
    v_company := p_company_id;
  else
    v_company := (select public.get_my_company_id());
  end if;

  if v_company is null then
    return jsonb_build_object('company', null, 'opened', 0, 'resolved', 0, 'active', 0);
  end if;

  -- Defensive: a prior call in the same session/transaction (e.g. a
  -- superuser sweeping several companies) may leave this behind.
  drop table if exists _active;
  create temp table _active (
    dedupe_key         text primary key,
    category           text,
    severity           text,
    source_module      text,
    title              text,
    body               text,
    action_url         text,
    source_record_type text,
    source_record_id   text,
    target_roles       text[],
    target_permission  text,
    target_entitlement text,
    metadata           jsonb
  ) on commit drop;

  -- ── C1 · document expiry ────────────────────────────────────────────
  -- company_documents with an expiry date inside 30 days, or already past.
  insert into _active
  select
    'document_expiry:' || d.id,
    'document_expiry',
    case when d.expiry_date < current_date then 'critical' else 'warning' end,
    'documents',
    case when d.expiry_date < current_date
         then 'Document expired: ' || d.title
         else 'Document expiring soon: ' || d.title end,
    '"' || d.title || '" ' ||
      case when d.expiry_date < current_date then 'expired on ' else 'is due to expire on ' end ||
      to_char(d.expiry_date, 'DD Mon YYYY') || '.',
    '/documents',
    'CompanyDocument', d.id::text,
    null, null, null,
    jsonb_build_object('expiryDate', d.expiry_date, 'category', d.category)
  from public.company_documents d
  where d.company_id = v_company
    and d.is_archived = false
    and d.expiry_date is not null
    and d.expiry_date <= current_date + 30;

  -- ── C2 · bank reconciliation issues ─────────────────────────────────
  -- Material unresolved Reconciliation-Intelligence findings (0018). One
  -- aggregate notification; auto-resolves when nothing material is open.
  insert into _active
  select
    'bank_reconciliation:' || v_company,
    'bank_reconciliation',
    case when bool_or(ri.severity in ('high','critical')) or sum(abs(coalesce(ri.effect_amount,0))) >= 10000
         then 'critical' else 'warning' end,
    'banking',
    count(*) || ' unresolved bank reconciliation issue' || case when count(*) = 1 then '' else 's' end,
    'Reconciliation review found ' || count(*) || ' unresolved issue' ||
      case when count(*) = 1 then '' else 's' end ||
      ' with a net effect of R' || to_char(sum(abs(coalesce(ri.effect_amount,0))), 'FM999G999G990D00') ||
      '. Open Bank Reconciliation to review and clear them.',
    '/banking/reconciliation',
    null, null,
    array['admin','accountant','manager'], null, 'banking',
    jsonb_build_object('issueCount', count(*), 'netEffect', sum(abs(coalesce(ri.effect_amount,0))))
  from public.reconciliation_issues ri
  where ri.company_id = v_company
    and ri.status = 'open'
    and (ri.severity in ('medium','high','critical') or abs(coalesce(ri.effect_amount,0)) >= 1000)
  having count(*) > 0;

  -- ── C3 · subscription / workspace problem ───────────────────────────
  insert into _active
  select
    'subscription_status:' || v_company,
    'subscription',
    case when c.suspended_at is not null or coalesce(s.status::text,'') in ('suspended','expired','cancelled')
         then 'critical' else 'warning' end,
    'subscription',
    case
      when c.suspended_at is not null then 'This workspace has been suspended'
      when s.status::text in ('suspended','expired','cancelled') then 'Your Vertex subscription is ' || s.status
      else 'Your Vertex subscription needs attention'
    end,
    case
      when c.suspended_at is not null
        then 'A platform administrator has suspended this workspace. Contact Vertex support to restore access.'
      when s.status::text = 'past_due'
        then 'The last subscription payment did not go through. Update billing to keep every module active.'
      else 'Subscription status is "' || coalesce(s.status::text,'unknown') ||
           '". Some modules may become read-only until this is resolved.'
    end,
    '/settings/subscription',
    null, null,
    array['admin'], null, null,
    jsonb_build_object('subscriptionStatus', s.status, 'workspaceSuspended', c.suspended_at is not null)
  from public.companies c
  left join public.subscriptions s on s.company_id = c.id
  where c.id = v_company
    and (c.suspended_at is not null or s.status::text in ('past_due','suspended','expired','cancelled'));

  -- ── C4 · blocked-access spike (security) ────────────────────────────
  -- >= 5 denied access-log events for this company in 24h. dedupe_key
  -- carries the UTC date so a recurrence on a later day is a new lifecycle.
  insert into _active
  select
    'access_denied_spike:' || v_company || ':' || to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
    'security',
    case when count(*) >= 20 then 'critical' else 'warning' end,
    'admin',
    count(*) || ' blocked access attempt' || case when count(*) = 1 then '' else 's' end || ' in the last 24 hours',
    count(*) || ' attempt' || case when count(*) = 1 then '' else 's' end ||
      ' to open a restricted area were blocked in the last 24 hours. Review the Access Log to confirm this is expected.',
    '/admin/audit',
    null, null,
    array['admin'], null, null,
    jsonb_build_object('deniedCount', count(*), 'windowHours', 24)
  from public.audit_logs_access a
  where a.company_id = v_company
    and a.result in ('denied_permission','denied_rls')
    and a.occurred_at > now() - interval '24 hours'
  having count(*) >= 5;

  -- ── C5 · accounting period left open too long (deadline) ────────────
  insert into _active
  select
    'period_open_overdue:' || p.id,
    'deadline',
    'warning',
    'accounting',
    'Accounting period still open: ' || p.name,
    'The period "' || p.name || '" ended on ' || to_char(p.end_date, 'DD Mon YYYY') ||
      ' and is still open. Soft-close or close it once the month is finalised so figures cannot drift.',
    '/financial-periods',
    'AccountingPeriod', p.id::text,
    array['admin','accountant'], 'financial_periods:manage', null,
    jsonb_build_object('periodEnd', p.end_date, 'periodName', p.name)
  from public.accounting_periods p
  where p.company_id = v_company
    and p.status = 'open'
    and p.end_date < current_date - 45;

  -- ── C6 · materially overdue receivables ─────────────────────────────
  insert into _active
  select
    'receivables_overdue:' || v_company,
    'receivable_overdue',
    case when sum(inv.total - inv.amount_paid) >= 100000 or count(*) >= 10 then 'critical' else 'warning' end,
    'sales',
    'R' || to_char(sum(inv.total - inv.amount_paid), 'FM999G999G990D00') || ' in receivables over 60 days overdue',
    count(*) || ' invoice' || case when count(*) = 1 then '' else 's' end ||
      ' totalling R' || to_char(sum(inv.total - inv.amount_paid), 'FM999G999G990D00') ||
      ' are more than 60 days past due. Follow up or consider an expected-credit-loss provision.',
    '/reports/customer-aging',
    null, null,
    array['admin','accountant','manager'], null, null,
    jsonb_build_object('invoiceCount', count(*), 'amountOutstanding', sum(inv.total - inv.amount_paid))
  from public.invoices inv
  where inv.company_id = v_company
    and inv.status in ('sent','partially_paid','overdue')
    and inv.due_date < now() - interval '60 days'
    and (inv.total - inv.amount_paid) > 0
  having count(*) > 0;

  -- ── C7 · negative on-hand stock (integrity) ─────────────────────────
  insert into _active
  select
    'inventory_negative_stock:' || v_company,
    'inventory_integrity',
    'critical',
    'inventory',
    count(*) || ' stock record' || case when count(*) = 1 then '' else 's' end || ' with a negative quantity',
    count(*) || ' product/warehouse balance' || case when count(*) = 1 then '' else 's' end ||
      ' show a negative on-hand quantity. This points to an out-of-sequence movement — review stock movements and adjust.',
    '/inventory/reports/inventory-reconciliation',
    null, null,
    null, null, 'inventory',
    jsonb_build_object('recordCount', count(*))
  from public.stock_balances b
  where b.company_id = v_company
    and b.quantity_on_hand < 0
  having count(*) > 0;

  -- ── C8 · products at / below reorder level (integrity) ──────────────
  insert into _active
  select
    'inventory_reorder:' || v_company,
    'inventory_integrity',
    'warning',
    'inventory',
    count(*) || ' product' || case when count(*) = 1 then '' else 's' end || ' at or below reorder level',
    count(*) || ' tracked product' || case when count(*) = 1 then '' else 's' end ||
      ' have fallen to or below their reorder level. Raise purchase orders to avoid stock-outs.',
    '/inventory/reports/low-stock',
    null, null,
    null, null, 'inventory',
    jsonb_build_object('productCount', count(*))
  from public.products pr
  where pr.company_id = v_company
    and pr.track_inventory = true
    and pr.status = 'active'
    and coalesce(pr.reorder_level, 0) > 0
    and coalesce(pr.quantity_on_hand, 0) <= pr.reorder_level
  having count(*) > 0;

  -- ── C9 · material budget variance (current month) ──────────────────
  -- Compares each budgeted account's posted net movement (debit - credit)
  -- for the current calendar month against its stored budget amount.
  -- Material = |actual - budget| >= max(R5 000, 15% of |budget|). Dormant
  -- until budgets are captured in financial_plan_lines (plan_type 'budget').
  insert into _active
  select
    'budget_variance:' || v_company || ':' ||
      extract(year from current_date)::int || '-' || lpad(extract(month from current_date)::int::text, 2, '0'),
    'budget_variance',
    'warning',
    'forecasting',
    v.n || ' budgeted account' || case when v.n = 1 then '' else 's' end || ' off budget this month',
    v.n || ' account' || case when v.n = 1 then '' else 's' end ||
      ' show a material variance against budget for the current month. Open Forecasting to review the causes.',
    '/reports/forecasting',
    null, null,
    array['admin','accountant','manager'], null, null,
    jsonb_build_object('accountCount', v.n)
  from (
    select count(*) as n
    from public.financial_plan_lines fpl
    join lateral (
      select coalesce(sum(jl.debit - jl.credit), 0) as actual
      from public.journal_lines jl
      join public.journal_entries je on je.id = jl.journal_entry_id and je.status = 'posted'
      where jl.company_id = v_company
        and jl.account_id = fpl.account_id
        and extract(year  from je.date) = fpl.period_year
        and extract(month from je.date) = fpl.period_month
    ) act on true
    where fpl.company_id = v_company
      and fpl.plan_type = 'budget'
      and fpl.period_year  = extract(year  from current_date)::int
      and fpl.period_month = extract(month from current_date)::int
      and abs(fpl.amount) > 0
      and abs(act.actual - fpl.amount) >= greatest(5000, 0.15 * abs(fpl.amount))
  ) v
  where v.n > 0;

  -- ── UPSERT active conditions ───────────────────────────────────────
  with ins as (
    insert into public.notifications as n
      (company_id, dedupe_key, category, severity, source_module, title, body,
       action_url, source_record_type, source_record_id, target_roles,
       target_permission, target_entitlement, metadata, last_seen_at)
    select
      v_company, a.dedupe_key, a.category, a.severity, a.source_module, a.title, a.body,
      a.action_url, a.source_record_type, a.source_record_id, a.target_roles,
      a.target_permission, a.target_entitlement, a.metadata, now()
    from _active a
    on conflict (company_id, dedupe_key) do update set
      category           = excluded.category,
      severity           = excluded.severity,
      source_module      = excluded.source_module,
      title              = excluded.title,
      body               = excluded.body,
      action_url         = excluded.action_url,
      source_record_type = excluded.source_record_type,
      source_record_id   = excluded.source_record_id,
      target_roles       = excluded.target_roles,
      target_permission  = excluded.target_permission,
      target_entitlement = excluded.target_entitlement,
      metadata           = excluded.metadata,
      last_seen_at       = now(),
      updated_at         = now(),
      status             = 'open',
      event_seq          = case when n.status = 'resolved' then n.event_seq + 1 else n.event_seq end,
      first_seen_at      = case when n.status = 'resolved' then now() else n.first_seen_at end,
      resolved_at        = null,
      resolution         = null
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_opened from ins;

  -- ── AUTO-RESOLVE cleared conditions ────────────────────────────────
  with res as (
    update public.notifications n
    set status = 'resolved', resolved_at = now(), resolution = 'condition_cleared', updated_at = now()
    where n.company_id = v_company
      and n.status = 'open'
      and not exists (select 1 from _active a where a.dedupe_key = n.dedupe_key)
    returning 1
  )
  select count(*) into v_resolved from res;

  select count(*) into v_active from public.notifications
  where company_id = v_company and status = 'open';

  return jsonb_build_object(
    'company', v_company, 'opened', v_opened, 'resolved', v_resolved, 'active', v_active
  );
end;
$$;

revoke all     on function public.evaluate_company_notifications(uuid) from public;
revoke execute on function public.evaluate_company_notifications(uuid) from anon;
grant  execute on function public.evaluate_company_notifications(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 5. READ RPCs
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.notification_feed(
  p_include_resolved boolean default false,
  p_limit            int     default 100
) returns table (
  id uuid, company_id uuid, dedupe_key text, category text, severity text,
  source_module text, title text, body text, action_url text,
  source_record_type text, source_record_id text, status text, event_seq int,
  first_seen_at timestamptz, last_seen_at timestamptz, resolved_at timestamptz,
  metadata jsonb, is_unread boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select
    n.id, n.company_id, n.dedupe_key, n.category, n.severity,
    n.source_module, n.title, n.body, n.action_url,
    n.source_record_type, n.source_record_id, n.status, n.event_seq,
    n.first_seen_at, n.last_seen_at, n.resolved_at,
    n.metadata,
    not exists (
      select 1 from public.notification_reads r
      where r.notification_id = n.id
        and r.user_id = (select auth.uid())
        and r.read_event_seq >= n.event_seq
    ) as is_unread
  from public.notifications n
  where public.notification_visible(n.company_id, n.target_roles, n.target_permission, n.target_entitlement)
    and (p_include_resolved or n.status = 'open')
    and (
      n.severity = 'critical'
      or not exists (
        select 1 from public.notification_mutes m
        where m.user_id = (select auth.uid()) and m.category = n.category
      )
    )
  order by
    (case n.severity when 'critical' then 0 when 'warning' then 1 else 2 end),
    (case n.status when 'open' then 0 else 1 end),
    n.last_seen_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

revoke all     on function public.notification_feed(boolean, int) from public;
revoke execute on function public.notification_feed(boolean, int) from anon;
grant  execute on function public.notification_feed(boolean, int) to authenticated;

create or replace function public.notification_unread_count()
returns int
language sql stable security definer set search_path to 'public'
as $$
  select count(*)::int
  from public.notifications n
  where n.status = 'open'
    and public.notification_visible(n.company_id, n.target_roles, n.target_permission, n.target_entitlement)
    and (
      n.severity = 'critical'
      or not exists (
        select 1 from public.notification_mutes m
        where m.user_id = (select auth.uid()) and m.category = n.category
      )
    )
    and not exists (
      select 1 from public.notification_reads r
      where r.notification_id = n.id
        and r.user_id = (select auth.uid())
        and r.read_event_seq >= n.event_seq
    );
$$;

revoke all     on function public.notification_unread_count() from public;
revoke execute on function public.notification_unread_count() from anon;
grant  execute on function public.notification_unread_count() to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 6. MUTATION RPCs
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_seq int;
begin
  select n.event_seq into v_seq
  from public.notifications n
  where n.id = p_id
    and public.notification_visible(n.company_id, n.target_roles, n.target_permission, n.target_entitlement);
  if v_seq is null then
    return; -- not visible to this user; nothing to do
  end if;
  insert into public.notification_reads (notification_id, user_id, read_event_seq)
  values (p_id, (select auth.uid()), v_seq)
  on conflict (notification_id, user_id)
    do update set read_event_seq = greatest(public.notification_reads.read_event_seq, excluded.read_event_seq),
                  read_at = now();
end;
$$;

create or replace function public.mark_all_notifications_read()
returns int
language plpgsql security definer set search_path to 'public'
as $$
declare v_n int;
begin
  with visible as (
    select n.id, n.event_seq
    from public.notifications n
    where n.status = 'open'
      and public.notification_visible(n.company_id, n.target_roles, n.target_permission, n.target_entitlement)
  ), upsert as (
    insert into public.notification_reads (notification_id, user_id, read_event_seq)
    select v.id, (select auth.uid()), v.event_seq from visible v
    on conflict (notification_id, user_id)
      do update set read_event_seq = greatest(public.notification_reads.read_event_seq, excluded.read_event_seq),
                    read_at = now()
    returning 1
  )
  select count(*) into v_n from upsert;
  return v_n;
end;
$$;

create or replace function public.set_notification_category_muted(p_category text, p_muted boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.notification_muteable_category(p_category) then
    raise exception 'set_notification_category_muted: "%" is a critical category and cannot be muted', p_category
      using errcode = '22023';
  end if;
  if p_muted then
    insert into public.notification_mutes (user_id, category)
    values ((select auth.uid()), p_category)
    on conflict (user_id, category) do nothing;
  else
    delete from public.notification_mutes
    where user_id = (select auth.uid()) and category = p_category;
  end if;
end;
$$;

do $grants$
begin
  execute 'revoke all on function public.mark_notification_read(uuid) from public, anon';
  execute 'revoke all on function public.mark_all_notifications_read() from public, anon';
  execute 'revoke all on function public.set_notification_category_muted(text, boolean) from public, anon';
  execute 'grant execute on function public.mark_notification_read(uuid) to authenticated';
  execute 'grant execute on function public.mark_all_notifications_read() to authenticated';
  execute 'grant execute on function public.set_notification_category_muted(text, boolean) to authenticated';
end;
$grants$;


-- ─────────────────────────────────────────────────────────────────────
-- 7. Observability
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.notifications') is null then raise exception '0073: notifications table missing'; end if;
  if to_regprocedure('public.evaluate_company_notifications(uuid)') is null then
    raise exception '0073: evaluate_company_notifications missing';
  end if;
  if has_function_privilege('anon', 'public.notification_feed(boolean, int)', 'execute') then
    raise exception '0073: notification_feed must not be anon-executable';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'notifications') <> 1 then
    raise exception '0073: notifications must have exactly one (SELECT-only) RLS policy';
  end if;
  raise notice '0073: OK — notifications + reads + mutes + engine + feed/unread/mark/mute RPCs in place.';
end $$;
