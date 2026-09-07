-- 0075_administration_permissions_and_audit
-- ADMINISTRATION MODULE · BLOCK G — app-wide administration hardening
-- (2026-09-07, branch administration-module-2026-09-06). PRE-MERGE.
-- `main` untouched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 1. PERMISSION CATALOG — the Administration features that had no gate
--    (extends the SAME Phase T catalog as 0064 — public.permissions /
--     public.role_permissions. No RLS change, no parallel system.)
--
--      documents           the Company Documents repository
--      notifications       the Notifications page / bell feed
--      settings            personal Settings (profile / password / theme /
--                          notification preferences)
--      accounting_settings the Accounting Settings page (company config +
--                          account mappings — read-only view, edited on the
--                          Company page)
--      billing             Plan & Billing
--
--    NO LOCKOUT (same reasoning as 0064, re-checked): public.user_roles has
--    0 assignments; the only company members are admin/superuser (which
--    bypass every fine-grained gate). This migration writes 0 user_roles
--    and 0 profiles rows. Grants mirror each role's existing shape.
--
-- 2. AUDIT COVERAGE — two trigger-based semantic events that had no writer:
--      role_assigned / role_unassigned   (public.user_roles)
--      user_access_changed               (public.profiles — role/is_active)
--    Trigger-based so a direct table call cannot bypass them. Payloads
--    carry NO secrets, NO email, NO PII beyond the role name and the
--    active flag.


-- ─────────────────────────────────────────────────────────────────────
-- 1a. Permission rows
-- ─────────────────────────────────────────────────────────────────────
insert into public.permissions (feature, action, description) values
  ('documents',           'read',   'View company documents'),
  ('documents',           'create', 'Upload company documents'),
  ('documents',           'update', 'Edit document details, archive and restore'),
  ('documents',           'delete', 'Permanently delete a document (superuser only in practice)'),
  ('documents',           'export', 'Download company documents'),
  ('notifications',       'read',   'View the notification feed and the Notifications page'),
  ('settings',            'read',   'Open personal Settings (profile, password, preferences)'),
  ('accounting_settings', 'read',   'View the Accounting Settings page (company config + account mappings)'),
  ('billing',             'read',   'View Plan & Billing')
on conflict (feature, action) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- 1b. System-role grants (company_id is null = system role)
-- ─────────────────────────────────────────────────────────────────────
with grant_map(role_name, feature, action) as (
  values
    -- documents: any member may view and file company records; archive is an
    -- update; hard delete stays superuser-only at the RLS layer.
    ('viewer','documents','read'), ('viewer','documents','export'),
    ('employee','documents','read'), ('employee','documents','create'), ('employee','documents','export'),
    ('sales_manager','documents','read'), ('sales_manager','documents','create'), ('sales_manager','documents','update'), ('sales_manager','documents','export'),
    ('stock_controller','documents','read'), ('stock_controller','documents','create'), ('stock_controller','documents','update'), ('stock_controller','documents','export'),
    ('finance_manager','documents','read'), ('finance_manager','documents','export'),
    ('accountant','documents','read'), ('accountant','documents','create'), ('accountant','documents','update'), ('accountant','documents','export'),

    -- notifications + personal settings: everyone
    ('viewer','notifications','read'), ('employee','notifications','read'), ('sales_manager','notifications','read'),
    ('stock_controller','notifications','read'), ('finance_manager','notifications','read'), ('accountant','notifications','read'),
    ('viewer','settings','read'), ('employee','settings','read'), ('sales_manager','settings','read'),
    ('stock_controller','settings','read'), ('finance_manager','settings','read'), ('accountant','settings','read'),

    -- accounting settings: the finance roles that also get `audit` / `gl`
    ('finance_manager','accounting_settings','read'),
    ('accountant','accounting_settings','read')

    -- billing: no system-role grant — admin / superuser only (they bypass).
)
insert into public.role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from grant_map g
join public.roles r on r.company_id is null and r.name = g.role_name
join public.permissions p on p.feature = g.feature and p.action = g.action
on conflict (role_id, permission_id) do nothing;


-- ─────────────────────────────────────────────────────────────────────
-- 2a. user_roles — role assign / unassign audit
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.user_roles_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid  text := coalesce((select auth.uid())::text, 'system');
  v_role text;
  v_co   uuid;
begin
  if tg_op = 'INSERT' then
    select name into v_role from public.roles where id = new.role_id;
    v_co := coalesce(new.company_id, (select company_id from public.profiles where id = new.user_id));
    if v_co is not null then
      insert into public.audit_log_entries
        (company_id, user_id, action, module, record_type, record_id, new_value)
      values (v_co, v_uid, 'role_assigned', 'admin', 'UserRole', new.user_id::text,
              jsonb_build_object('role', v_role, 'targetUserId', new.user_id));
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    select name into v_role from public.roles where id = old.role_id;
    v_co := coalesce(old.company_id, (select company_id from public.profiles where id = old.user_id));
    if v_co is not null then
      insert into public.audit_log_entries
        (company_id, user_id, action, module, record_type, record_id, previous_value)
      values (v_co, v_uid, 'role_unassigned', 'admin', 'UserRole', old.user_id::text,
              jsonb_build_object('role', v_role, 'targetUserId', old.user_id));
    end if;
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.user_roles_audit() from public, anon, authenticated;

drop trigger if exists user_roles_audit_aid on public.user_roles;
create trigger user_roles_audit_aid
  after insert or delete on public.user_roles
  for each row execute function public.user_roles_audit();


-- ─────────────────────────────────────────────────────────────────────
-- 2b. profiles — access-level / active-flag change audit
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.profiles_access_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := coalesce((select auth.uid())::text, 'system');
begin
  if new.company_id is null then
    return new; -- unassigned profile; nothing company-scoped to record
  end if;
  if old.role is distinct from new.role or old.is_active is distinct from new.is_active then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, previous_value, new_value)
    values (new.company_id, v_uid, 'user_access_changed', 'admin', 'Profile', new.id::text,
            jsonb_build_object('role', old.role, 'isActive', old.is_active),
            jsonb_build_object('role', new.role, 'isActive', new.is_active));
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_access_audit() from public, anon, authenticated;

drop trigger if exists profiles_access_audit_au on public.profiles;
create trigger profiles_access_audit_au
  after update on public.profiles
  for each row execute function public.profiles_access_audit();


-- ─────────────────────────────────────────────────────────────────────
-- 3. Observability
-- ─────────────────────────────────────────────────────────────────────
do $$
declare v_perms int; v_grants int;
begin
  select count(*) into v_perms from public.permissions
   where feature in ('documents','notifications','settings','accounting_settings','billing');
  select count(*) into v_grants from public.role_permissions rp
   join public.permissions p on p.id = rp.permission_id
   where p.feature in ('documents','notifications','settings','accounting_settings','billing');
  if v_perms <> 9 then raise exception '0075: expected 9 permission rows, got %', v_perms; end if;
  if v_grants <> 33 then raise exception '0075: expected 33 role grants, got %', v_grants; end if;
  if not exists (select 1 from pg_trigger where tgname = 'user_roles_audit_aid') then
    raise exception '0075: user_roles audit trigger missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_access_audit_au') then
    raise exception '0075: profiles access audit trigger missing';
  end if;
  raise notice '0075: OK — % Administration permission rows, % grants, + user_roles / profiles audit triggers.', v_perms, v_grants;
end $$;
