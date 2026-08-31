-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823211553 · name: 0010_phase_t_auth_roles_permissions

-- Phase T: Multi-Tenant Auth + Role System + Superuser Dashboard.
--
-- Architecture decision (confirmed with the user before this ran): this
-- LAYERS a fine-grained roles/permissions system on top of the existing
-- profiles.role enum (admin|accountant|manager|operator|viewer|superuser)
-- rather than replacing it. The existing 45 tables' RLS policies (all
-- scoped via get_my_company_id()) are UNTOUCHED by this migration -- zero
-- risk to already-shipped modules. This new layer drives:
--   1. The Superuser Dashboard (company_id IS NULL profiles.role='superuser'
--      row is automatically excluded from every existing company_id-scoped
--      policy, since `company_id = NULL` is never true in SQL -- no rewrite
--      needed for that blocking to work).
--   2. The Users & Roles admin UI + usePermission() feature-gating hook.
-- It does NOT yet gate the 45 existing tables at the feature/action level
-- -- that enforcement is still profiles.role only. Documented prominently
-- in docs/SUPABASE_MIGRATION_GUIDE.md so this isn't mistaken for full
-- per-feature backend enforcement.

create function public.get_my_role() returns public.profile_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = (select auth.uid()) $$;

revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_role() to authenticated;

-- Superuser bookkeeping columns on companies (usage metering / storage /
-- egress requires platform-level Supabase Management API access, which no
-- MCP tool here exposes -- deliberately NOT modeled; the Superuser
-- Dashboard computes activity stats from real rows instead, see app code).
alter table public.companies add column if not exists subscription_tier text not null default 'free';

--------------------------------------------------------------------------
-- 1. permissions (global feature/action catalog, system-managed only)
--------------------------------------------------------------------------
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (feature, action)
);
comment on table public.permissions is 'Phase T SS2076A5.1 -- global feature/action catalog. No client insert/update/delete policy: system-managed via migration seed only.';

alter table public.permissions enable row level security;

create policy "permissions_select" on public.permissions
  for select to authenticated using (true);

--------------------------------------------------------------------------
-- 2. roles
--------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  description text,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.roles is 'Deviates from a literal "company_id not null" brief: nullable company_id means NULL = system role (shared by every tenant, seeded once), NOT NULL = a company''s own custom role. Avoids duplicating the 6 system roles per tenant.';

create unique index roles_system_name_unique on public.roles (name) where company_id is null;
create unique index roles_company_name_unique on public.roles (company_id, name) where company_id is not null;
create index roles_company_id_idx on public.roles (company_id);

alter table public.roles enable row level security;

create policy "roles_select" on public.roles
  for select to authenticated using (
    company_id is null or company_id = (select public.get_my_company_id())
  );

create policy "roles_insert_custom" on public.roles
  for insert to authenticated with check (
    is_custom = true
    and company_id = (select public.get_my_company_id())
    and public.get_my_role() = 'admin'
  );

create policy "roles_update_custom" on public.roles
  for update to authenticated using (
    is_custom = true and company_id = (select public.get_my_company_id()) and public.get_my_role() = 'admin'
  ) with check (
    is_custom = true and company_id = (select public.get_my_company_id())
  );

create policy "roles_delete_custom" on public.roles
  for delete to authenticated using (
    is_custom = true and company_id = (select public.get_my_company_id()) and public.get_my_role() = 'admin'
  );

--------------------------------------------------------------------------
-- 3. role_permissions
--------------------------------------------------------------------------
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted boolean not null default true,
  primary key (role_id, permission_id)
);
create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

alter table public.role_permissions enable row level security;

create policy "role_permissions_select" on public.role_permissions
  for select to authenticated using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (r.company_id is null or r.company_id = (select public.get_my_company_id()))
    )
  );

create policy "role_permissions_write_custom" on public.role_permissions
  for all to authenticated using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id and r.is_custom = true and r.company_id = (select public.get_my_company_id())
    )
    and public.get_my_role() = 'admin'
  ) with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id and r.is_custom = true and r.company_id = (select public.get_my_company_id())
    )
  );

--------------------------------------------------------------------------
-- 4. user_roles
--------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  primary key (user_id, role_id, company_id)
);
create index user_roles_company_id_idx on public.user_roles (company_id);
create index user_roles_user_id_idx on public.user_roles (user_id);

alter table public.user_roles enable row level security;

create policy "user_roles_select" on public.user_roles
  for select to authenticated using (
    company_id = (select public.get_my_company_id()) or public.get_my_role() = 'superuser'
  );

create policy "user_roles_insert_admin" on public.user_roles
  for insert to authenticated with check (
    company_id = (select public.get_my_company_id()) and public.get_my_role() = 'admin'
  );

create policy "user_roles_update_admin" on public.user_roles
  for update to authenticated using (
    company_id = (select public.get_my_company_id()) and public.get_my_role() = 'admin'
  ) with check (
    company_id = (select public.get_my_company_id())
  );

create policy "user_roles_delete_admin" on public.user_roles
  for delete to authenticated using (
    company_id = (select public.get_my_company_id()) and public.get_my_role() = 'admin'
  );

--------------------------------------------------------------------------
-- 5. audit_logs_access (WHO accessed WHAT, WHEN, allowed/denied)
--------------------------------------------------------------------------
create table public.audit_logs_access (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  company_id uuid references public.companies(id),
  result text not null check (result in ('allowed', 'denied_rls', 'denied_permission')),
  detail jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_logs_access_company_id_idx on public.audit_logs_access (company_id);
create index audit_logs_access_occurred_at_idx on public.audit_logs_access (occurred_at desc);
comment on table public.audit_logs_access is 'occurred_at, not the brief''s literal "timestamp" -- that word is a reserved-adjacent SQL type name, avoided for clarity.';

alter table public.audit_logs_access enable row level security;

create policy "audit_logs_access_select" on public.audit_logs_access
  for select to authenticated using (
    (company_id = (select public.get_my_company_id()) and public.get_my_role() = 'admin')
    or public.get_my_role() = 'superuser'
  );

create policy "audit_logs_access_insert" on public.audit_logs_access
  for insert to authenticated with check (
    actor_id = (select auth.uid())
    and (company_id = (select public.get_my_company_id()) or company_id is null)
  );

--------------------------------------------------------------------------
-- 6. Additive superuser read-only access to companies/profiles (support
-- only -- no financial-data table gets any superuser policy at all).
--------------------------------------------------------------------------
create policy "companies_select_superuser" on public.companies
  for select to authenticated using (public.get_my_role() = 'superuser');

create policy "profiles_select_superuser" on public.profiles
  for select to authenticated using (public.get_my_role() = 'superuser');

create policy "profiles_update_role_superuser" on public.profiles
  for update to authenticated using (public.get_my_role() = 'superuser')
  with check (public.get_my_role() = 'superuser');

--------------------------------------------------------------------------
-- 7. Seed: permissions catalog
--------------------------------------------------------------------------
insert into public.permissions (feature, action) values
  ('invoicing', 'create'), ('invoicing', 'read'), ('invoicing', 'update'), ('invoicing', 'delete'), ('invoicing', 'export'),
  ('inventory', 'create'), ('inventory', 'read'), ('inventory', 'update'), ('inventory', 'delete'), ('inventory', 'export'),
  ('payroll', 'create'), ('payroll', 'read'), ('payroll', 'update'), ('payroll', 'delete'),
  ('gl', 'read'),
  ('reports', 'read'), ('reports', 'export'),
  ('customer_management', 'create'), ('customer_management', 'read'), ('customer_management', 'update'), ('customer_management', 'delete'),
  ('supplier_management', 'create'), ('supplier_management', 'read'), ('supplier_management', 'update'), ('supplier_management', 'delete'),
  ('user_management', 'read'), ('user_management', 'create'), ('user_management', 'update'),
  ('dashboard', 'read');

--------------------------------------------------------------------------
-- 8. Seed: system roles (company_id NULL = shared by every tenant)
--------------------------------------------------------------------------
insert into public.roles (name, description, is_custom) values
  ('accountant', 'Full ledger, GL, and reporting access.', false),
  ('stock_controller', 'Inventory and stock movements.', false),
  ('sales_manager', 'Invoicing, sales orders, and customers.', false),
  ('finance_manager', 'All reports, trial balance, and GL (read-only).', false),
  ('employee', 'Basic read access: invoicing, customers, suppliers, dashboard.', false),
  ('viewer', 'Read-only access to everything.', false);

--------------------------------------------------------------------------
-- 9. Seed: role_permissions mappings.
-- The brief's own mapping table leaves payroll ungranted to any system
-- role -- extended here (accountant: create/read/update; finance_manager:
-- read) as a reasonable real-world default, called out explicitly rather
-- than silently guessed, since neither role's original bullet mentioned
-- payroll at all.
--------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id, granted)
select r.id, p.id, true from public.roles r, public.permissions p
where r.company_id is null and (
  (r.name = 'accountant' and (
    (p.feature = 'gl' and p.action = 'read') or
    (p.feature = 'reports') or
    (p.feature in ('invoicing', 'customer_management', 'supplier_management', 'inventory')) or
    (p.feature = 'dashboard' and p.action = 'read') or
    (p.feature = 'payroll' and p.action in ('create', 'read', 'update'))
  ))
  or (r.name = 'stock_controller' and (
    p.feature = 'inventory' or (p.feature = 'dashboard' and p.action = 'read')
  ))
  or (r.name = 'sales_manager' and (
    p.feature in ('invoicing', 'customer_management') or (p.feature = 'dashboard' and p.action = 'read')
  ))
  or (r.name = 'finance_manager' and (
    (p.feature = 'gl' and p.action = 'read') or p.feature = 'reports' or
    (p.feature = 'dashboard' and p.action = 'read') or (p.feature = 'payroll' and p.action = 'read')
  ))
  or (r.name = 'employee' and (
    (p.feature = 'invoicing' and p.action = 'read') or
    (p.feature = 'customer_management' and p.action = 'read') or
    (p.feature = 'supplier_management' and p.action = 'read') or
    (p.feature = 'dashboard' and p.action = 'read')
  ))
  or (r.name = 'viewer' and p.action = 'read')
);
