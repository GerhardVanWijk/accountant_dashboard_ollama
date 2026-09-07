-- 0073b_notifications_engine_reentrancy
-- ADMINISTRATION MODULE · BLOCK D follow-up (2026-09-07). PRE-MERGE.
--
-- evaluate_company_notifications() creates a `_active` temp table with
-- `on commit drop`. A superuser sweeping several companies in ONE database
-- connection (or any caller that invokes it twice before commit) hit
-- "relation \"_active\" already exists". This adds a `drop table if exists`
-- guard so the function is safely re-entrant within a session.
--
-- On a fresh `supabase db reset` this is a harmless no-op: migration 0073
-- already carries the guarded body. It is a distinct file only because the
-- live Vertex project had 0073 applied before the fix was found.

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
