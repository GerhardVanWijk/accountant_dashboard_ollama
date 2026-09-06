-- 0070_superuser_platform_console
-- SUPERUSER → VERTEX PLATFORM ADMINISTRATION CONSOLE (2026-09-06, branch
-- superuser-platform-console-2026-09-06). PRE-MERGE. `main` untouched.
-- NO payments processed. NO customer accounting data touched.
--
-- ═══════════════════════════════════════════════════════════════════════
-- WHAT THIS ADDS  (all additive; ONE central helper replaced in place with
-- a strict superset of its old semantics — see §2)
--   companies              + suspended_at / suspended_by / suspension_reason
--   get_my_company_id()    now returns NULL for a member of a SUSPENDED
--                          company (client suspension enforcement — every
--                          company-scoped RLS clause then denies). Superuser
--                          and companyless users unaffected.
--   my_workspace_suspended()          — lets a suspended member's client
--                                       discover why the workspace is empty
--   set_company_suspended()           — superuser suspend / reactivate a
--                                       client, audited
--   audit_log_entries      + a superuser cross-company SELECT policy
--                            (Security & Audit console screen)
--   superuser_set_subscription_plan() / superuser_set_subscription_status()
--                          — audited MANUAL platform-subscription override
--                            (provider = 'manual', distinct from a future
--                            Paystack 'provider' and from unmanaged = no row)
--   superuser_set_member_access()      — audited access-level / suspend of
--                                       any company member
--   superuser_assign_role() / superuser_unassign_role()
--                          — fine-grained role management for a superuser
--                            (the normal user_roles policies are admin+own
--                            company only)
--   superuser_remove_member_from_company()
--   bookkeeper             — new fine-grained SYSTEM role + permission grants
--                            (operational bookkeeping; NO user_management,
--                            NO audit, NO period close). profile_role enum
--                            is UNCHANGED.
--   platform_admin_metrics()          — one authoritative KPI aggregate
--   platform_admin_company_users()    — per-member directory incl. last
--                                       sign-in (auth.users), superuser only
--
-- PRIVACY BOUNDARY: none of this exposes a customer's ledger, invoices,
-- balances, payroll or tax. Superuser screens show configuration HEALTH and
-- account administration only.
--
-- BILLING SEPARATION: platform billing for Vertex itself. No journal
-- entries, no GL accounts, no Trial Balance impact.


-- ═════════════════════════════════════════════════════════════════════
-- 1. companies — client-suspension metadata
-- ═════════════════════════════════════════════════════════════════════
-- `is_active` already exists (default true). These record WHO suspended a
-- client, WHEN and WHY. All nullable; a NULL set means "never suspended".
alter table public.companies
  add column if not exists suspended_at      timestamptz,
  add column if not exists suspended_by      uuid,
  add column if not exists suspension_reason text;

comment on column public.companies.suspended_at is 'When a superuser last set is_active = false. NULL when the client is active or was never suspended.';


-- ═════════════════════════════════════════════════════════════════════
-- 2. get_my_company_id() — SUSPENDED-CLIENT ENFORCEMENT
-- ═════════════════════════════════════════════════════════════════════
-- Old body:
--   select company_id from public.profiles
--   where id = (select auth.uid()) and is_active = true
-- New body additionally requires the profile's company to be ACTIVE. A
-- member of a suspended company now resolves to NULL here, so every RLS
-- policy of the form `company_id = (select get_my_company_id())` denies —
-- reads and writes both. Semantics are otherwise identical:
--   * companyless profile  -> inner join drops the row -> NULL (as before)
--   * suspended own profile -> `is_active = true` already excluded it (as before)
--   * superuser            -> company_id IS NULL -> NULL (as before); a
--                            superuser is scoped by get_my_role(), never this.
-- The company self-read policy also denies once this returns NULL, so
-- my_workspace_suspended() (§3) exists for the client to detect the state.
create or replace function public.get_my_company_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.company_id
  from public.profiles p
  join public.companies c on c.id = p.company_id and c.is_active = true
  where p.id = (select auth.uid())
    and p.is_active = true
$function$;


-- ═════════════════════════════════════════════════════════════════════
-- 3. my_workspace_suspended() — client-side "why is my workspace empty?"
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.my_workspace_suspended()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    join public.companies c on c.id = p.company_id
    where p.id = (select auth.uid())
      and c.is_active = false
  )
$function$;

revoke all     on function public.my_workspace_suspended() from public;
revoke execute on function public.my_workspace_suspended() from anon;
grant  execute on function public.my_workspace_suspended() to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 4. set_company_suspended() — superuser suspend / reactivate a client
-- ═════════════════════════════════════════════════════════════════════
-- Blocks normal member access (via §2). Does NOT delete data, users,
-- journals, documents; does NOT touch the GL, inventory or any Paystack
-- subscription. Superuser platform administration is unaffected. Audited.
create or replace function public.set_company_suspended(
  p_company_id uuid,
  p_suspend    boolean,
  p_reason     text default null
) returns public.companies
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_co  public.companies;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can change a client''s access status.' using errcode = '42501';
  end if;
  if p_company_id is null then
    raise exception 'A company is required.' using errcode = '22004';
  end if;

  select * into v_co from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'That company does not exist.' using errcode = 'P0002';
  end if;

  if p_suspend and not v_co.is_active then
    return v_co;  -- already suspended; idempotent
  end if;
  if not p_suspend and v_co.is_active then
    return v_co;  -- already active; idempotent
  end if;

  update public.companies
     set is_active         = not p_suspend,
         suspended_at       = case when p_suspend then now() else null end,
         suspended_by       = case when p_suspend then v_uid else null end,
         suspension_reason  = case when p_suspend then nullif(btrim(p_reason), '') else null end,
         updated_at         = now()
   where id = p_company_id
   returning * into v_co;

  insert into public.audit_log_entries
    (company_id, user_id, action, module, record_type, record_id, previous_value, new_value, reason)
  values
    (p_company_id, v_uid::text,
     case when p_suspend then 'cancelled' else 'edited' end,
     'platform', 'Company', p_company_id::text,
     jsonb_build_object('isActive', not p_suspend),
     jsonb_build_object('isActive', p_suspend is false),
     case when p_suspend
          then coalesce('Client suspended: ' || nullif(btrim(p_reason), ''), 'Client suspended by superuser')
          else 'Client access reactivated by superuser' end);

  return v_co;
end;
$$;

revoke all     on function public.set_company_suspended(uuid, boolean, text) from public;
revoke execute on function public.set_company_suspended(uuid, boolean, text) from anon;
grant  execute on function public.set_company_suspended(uuid, boolean, text) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 5. audit_log_entries — superuser cross-company read
-- ═════════════════════════════════════════════════════════════════════
-- The company-scoped read policy (audit_log_entries_select_own_company)
-- stays exactly as-is; this only ADDS a parallel superuser path for the
-- platform Security & Audit console. Insert policy unchanged.
drop policy if exists audit_log_entries_select_superuser on public.audit_log_entries;
create policy audit_log_entries_select_superuser on public.audit_log_entries
  for select to authenticated
  using (public.get_my_role() = 'superuser');


-- ═════════════════════════════════════════════════════════════════════
-- 6. MANUAL platform-subscription override (superuser)
-- ═════════════════════════════════════════════════════════════════════
-- A superuser can assign / change / suspend / reactivate a company's Vertex
-- plan WITHOUT Paystack. Every such subscription row is marked
-- `provider = 'manual'` so a provider-managed one (future: 'paystack') and
-- an unmanaged company (NO row at all) stay distinguishable forever. Writes
-- a subscription_events row AND an audit_log_entries row. Never deletes or
-- alters any accounting data — a downgrade only changes which modules the
-- company may open.
create or replace function public.superuser_set_subscription_plan(
  p_company_id uuid,
  p_plan_code  text,
  p_status     public.subscription_status default 'active'
) returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_plan_id uuid;
  v_prev    public.subscriptions;
  v_sub     public.subscriptions;
  v_event   text;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can manage a subscription.' using errcode = '42501';
  end if;
  if p_company_id is null then
    raise exception 'A company is required.' using errcode = '22004';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'That company does not exist.' using errcode = 'P0002';
  end if;

  select id into v_plan_id from public.subscription_plans where code = p_plan_code and is_active;
  if v_plan_id is null then
    raise exception 'Unknown or inactive plan "%".', p_plan_code using errcode = '22023';
  end if;
  if p_status not in ('active', 'trialing', 'past_due', 'suspended', 'cancelled') then
    raise exception 'A manual override cannot set status "%".', p_status using errcode = '22023';
  end if;

  select * into v_prev from public.subscriptions where company_id = p_company_id for update;

  if not found then
    insert into public.subscriptions (company_id, plan_id, status, provider, activated_at,
                                      current_period_start, current_period_end)
    values (p_company_id, v_plan_id, p_status, 'manual',
            case when p_status in ('active', 'trialing') then now() end,
            current_date,
            (current_date + interval '1 month')::date)
    returning * into v_sub;
    v_event := 'created';
  else
    update public.subscriptions
       set plan_id      = v_plan_id,
           status       = p_status,
           provider     = 'manual',
           activated_at = coalesce(v_prev.activated_at,
                                   case when p_status in ('active', 'trialing') then now() end),
           cancelled_at = case when p_status = 'cancelled' then now() else null end,
           updated_at   = now()
     where company_id = p_company_id
     returning * into v_sub;
    v_event := case
                 when v_prev.plan_id <> v_plan_id then 'plan_changed'
                 when v_prev.status <> p_status   then p_status::text
                 else 'plan_changed'
               end;
  end if;

  insert into public.subscription_events (subscription_id, company_id, event_type, detail)
  values (v_sub.id, p_company_id, v_event,
          jsonb_build_object('planCode', p_plan_code, 'status', p_status,
                             'override', 'manual', 'by', v_uid,
                             'previousPlanId', v_prev.plan_id, 'previousStatus', v_prev.status));

  insert into public.audit_log_entries
    (company_id, user_id, action, module, record_type, record_id, previous_value, new_value, reason)
  values
    (p_company_id, v_uid::text, 'edited', 'platform', 'Subscription', v_sub.id::text,
     jsonb_build_object('planId', v_prev.plan_id, 'status', v_prev.status),
     jsonb_build_object('planId', v_plan_id, 'status', p_status, 'provider', 'manual'),
     'Manual / superuser subscription override');

  return v_sub;
end;
$$;

revoke all     on function public.superuser_set_subscription_plan(uuid, text, public.subscription_status) from public;
revoke execute on function public.superuser_set_subscription_plan(uuid, text, public.subscription_status) from anon;
grant  execute on function public.superuser_set_subscription_plan(uuid, text, public.subscription_status) to authenticated;


create or replace function public.superuser_set_subscription_status(
  p_company_id uuid,
  p_status     public.subscription_status
) returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_prev public.subscriptions;
  v_sub  public.subscriptions;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can manage a subscription.' using errcode = '42501';
  end if;

  select * into v_prev from public.subscriptions where company_id = p_company_id for update;
  if not found then
    raise exception 'That company has no subscription to change. Assign a plan first.' using errcode = 'P0002';
  end if;
  if p_status not in ('active', 'trialing', 'past_due', 'suspended', 'cancelled', 'expired') then
    raise exception 'Invalid subscription status "%".', p_status using errcode = '22023';
  end if;

  update public.subscriptions
     set status       = p_status,
         provider     = 'manual',
         cancelled_at = case when p_status in ('cancelled', 'expired') then now() else null end,
         updated_at   = now()
   where company_id = p_company_id
   returning * into v_sub;

  insert into public.subscription_events (subscription_id, company_id, event_type, detail)
  values (v_sub.id, p_company_id, p_status::text,
          jsonb_build_object('override', 'manual', 'by', v_uid, 'previousStatus', v_prev.status));

  insert into public.audit_log_entries
    (company_id, user_id, action, module, record_type, record_id, previous_value, new_value, reason)
  values
    (p_company_id, v_uid::text, 'edited', 'platform', 'Subscription', v_sub.id::text,
     jsonb_build_object('status', v_prev.status),
     jsonb_build_object('status', p_status, 'provider', 'manual'),
     'Manual / superuser subscription status change');

  return v_sub;
end;
$$;

revoke all     on function public.superuser_set_subscription_status(uuid, public.subscription_status) from public;
revoke execute on function public.superuser_set_subscription_status(uuid, public.subscription_status) from anon;
grant  execute on function public.superuser_set_subscription_status(uuid, public.subscription_status) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 7. superuser member administration
-- ═════════════════════════════════════════════════════════════════════
-- A superuser has NO company, so the ordinary admin+own-company policies on
-- profiles.role / user_roles don't apply to them. These RPCs give the
-- platform owner controlled, audited member administration for ANY company,
-- with the same guardrails company admins already have:
--   * cannot touch a superuser account
--   * cannot act on their own account (self-lockout)
--   * a fine-grained role must belong to the member's company or be a system role
create or replace function public.superuser_set_member_access(
  p_user_id      uuid,
  p_profile_role public.profile_role default null,
  p_is_active    boolean default null
) returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_target public.profiles;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can administer members here.' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'Use your own account settings — a superuser cannot change their own access here.' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;
  if v_target.role = 'superuser' then
    raise exception 'A superuser account cannot be modified here.' using errcode = '42501';
  end if;
  if p_profile_role = 'superuser' then
    raise exception 'Granting superuser is not available through this action.' using errcode = '42501';
  end if;

  -- Don't strand a company with no active administrator. The superuser
  -- remains a recovery path, but this makes it a deliberate two-step.
  if v_target.company_id is not null
     and v_target.role = 'admin' and v_target.is_active
     and ((p_profile_role is not null and p_profile_role <> 'admin') or p_is_active = false)
     and (select count(*) from public.profiles p
          where p.company_id = v_target.company_id and p.role = 'admin' and p.is_active) <= 1 then
    raise exception 'That is the company''s only active administrator. Promote another member to admin first.' using errcode = '42501';
  end if;

  update public.profiles
     set role       = coalesce(p_profile_role, role),
         is_active  = coalesce(p_is_active, is_active),
         updated_at = now()
   where id = p_user_id
   returning * into v_target;

  -- audit_log_entries.company_id is NOT NULL; a companyless account (a bare
  -- signup a superuser is suspending) has no company to scope the row to.
  if v_target.company_id is not null then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, new_value, reason)
    values
      (v_target.company_id, v_uid::text, 'permission_changed', 'platform', 'Profile', p_user_id::text,
       jsonb_build_object('role', v_target.role, 'isActive', v_target.is_active),
       'Superuser member administration');
  end if;

  return v_target;
end;
$$;

revoke all     on function public.superuser_set_member_access(uuid, public.profile_role, boolean) from public;
revoke execute on function public.superuser_set_member_access(uuid, public.profile_role, boolean) from anon;
grant  execute on function public.superuser_set_member_access(uuid, public.profile_role, boolean) to authenticated;


create or replace function public.superuser_remove_member_from_company(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_target public.profiles;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can remove a member.' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'A superuser cannot remove their own account.' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;
  if v_target.role = 'superuser' then
    raise exception 'A superuser account has no company to remove.' using errcode = '42501';
  end if;
  if v_target.company_id is null then
    return;  -- already companyless; idempotent
  end if;
  if v_target.role = 'admin'
     and (select count(*) from public.profiles p
          where p.company_id = v_target.company_id and p.role = 'admin' and p.is_active) <= 1 then
    raise exception 'That is the company''s only active administrator — assign another admin first.' using errcode = '42501';
  end if;

  delete from public.user_roles where user_id = p_user_id and company_id = v_target.company_id;

  update public.profiles
     set company_id = null, role = 'viewer', updated_at = now()
   where id = p_user_id;

  insert into public.audit_log_entries
    (company_id, user_id, action, module, record_type, record_id, previous_value, reason)
  values
    (v_target.company_id, v_uid::text, 'permission_changed', 'platform', 'Profile', p_user_id::text,
     jsonb_build_object('companyId', v_target.company_id, 'role', v_target.role),
     'Superuser removed member from company');
end;
$$;

revoke all     on function public.superuser_remove_member_from_company(uuid) from public;
revoke execute on function public.superuser_remove_member_from_company(uuid) from anon;
grant  execute on function public.superuser_remove_member_from_company(uuid) to authenticated;


create or replace function public.superuser_assign_role(p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_company uuid;
  v_role_co uuid;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can assign roles here.' using errcode = '42501';
  end if;

  select company_id into v_company from public.profiles where id = p_user_id;
  if v_company is null then
    raise exception 'That user is not a member of any company.' using errcode = '42501';
  end if;

  select company_id into v_role_co from public.roles where id = p_role_id;
  if not found then
    raise exception 'No such role.' using errcode = 'P0002';
  end if;
  if v_role_co is not null and v_role_co <> v_company then
    raise exception 'That role is not available to this company.' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role_id, company_id, assigned_by)
  values (p_user_id, p_role_id, v_company, v_uid)
  on conflict (user_id, role_id, company_id) do nothing;

  insert into public.audit_log_entries
    (company_id, user_id, action, module, record_type, record_id, new_value, reason)
  values
    (v_company, v_uid::text, 'permission_changed', 'platform', 'UserRole', p_user_id::text,
     jsonb_build_object('roleId', p_role_id), 'Superuser assigned role');
end;
$$;

revoke all     on function public.superuser_assign_role(uuid, uuid) from public;
revoke execute on function public.superuser_assign_role(uuid, uuid) from anon;
grant  execute on function public.superuser_assign_role(uuid, uuid) to authenticated;


create or replace function public.superuser_unassign_role(p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_company uuid;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can remove roles here.' using errcode = '42501';
  end if;

  select p.company_id into v_company from public.profiles p where p.id = p_user_id;

  delete from public.user_roles
   where user_id = p_user_id and role_id = p_role_id
     and (v_company is null or company_id = v_company);

  -- Audit only when we have a company to scope the row to (company_id is
  -- NOT NULL on audit_log_entries). A companyless user has no company-scoped
  -- role assignments to remove anyway.
  if v_company is not null then
    insert into public.audit_log_entries
      (company_id, user_id, action, module, record_type, record_id, previous_value, reason)
    values
      (v_company, v_uid::text, 'permission_changed', 'platform', 'UserRole', p_user_id::text,
       jsonb_build_object('roleId', p_role_id), 'Superuser removed role');
  end if;
end;
$$;

revoke all     on function public.superuser_unassign_role(uuid, uuid) from public;
revoke execute on function public.superuser_unassign_role(uuid, uuid) from anon;
grant  execute on function public.superuser_unassign_role(uuid, uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 7b. superuser invitation administration
-- ═════════════════════════════════════════════════════════════════════
-- create_company_invitation / revoke_company_invitation (migration 0069)
-- are admin-of-own-company only. A superuser has no company, so the console
-- gets its own thin wrappers that target a company explicitly. Same token
-- security (hash-only, single-use, 7-day, email-bound) — they simply reuse
-- the invited-company as the scope instead of get_my_company_id().
create or replace function public.superuser_create_company_invitation(
  p_company_id   uuid,
  p_email        text,
  p_profile_role public.profile_role default 'operator',
  p_role_id      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_email   text := lower(btrim(p_email));
  v_token   text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id      uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can invite users here.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'That company does not exist.' using errcode = 'P0002';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if p_profile_role = 'superuser' then
    raise exception 'You cannot invite someone as a superuser.' using errcode = '42501';
  end if;
  if p_role_id is not null and not exists (
    select 1 from public.roles r where r.id = p_role_id and (r.company_id is null or r.company_id = p_company_id)
  ) then
    raise exception 'That role is not available to this company.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where lower(p.email) = v_email and p.company_id = p_company_id) then
    raise exception 'That person is already in this company.' using errcode = '42501';
  end if;

  update public.company_invitations
     set status = 'revoked', revoked_at = now()
   where company_id = p_company_id and lower(email) = v_email and status = 'pending';

  insert into public.company_invitations (company_id, email, token_hash, profile_role, role_id, invited_by, expires_at)
  values (p_company_id, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_profile_role, p_role_id, v_uid, v_expires)
  returning id into v_id;

  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, new_value, reason)
  values (p_company_id, v_uid::text, 'permission_changed', 'platform', 'CompanyInvitation', v_id::text,
          jsonb_build_object('email', v_email, 'profileRole', p_profile_role), 'Superuser created invitation');

  return jsonb_build_object(
    'invitation_id', v_id, 'email', v_email, 'token', v_token,
    'accept_path', '/accept-invite?token=' || v_token,
    'expires_at', v_expires, 'email_sent', false
  );
end;
$$;

revoke all     on function public.superuser_create_company_invitation(uuid, text, public.profile_role, uuid) from public;
revoke execute on function public.superuser_create_company_invitation(uuid, text, public.profile_role, uuid) from anon;
grant  execute on function public.superuser_create_company_invitation(uuid, text, public.profile_role, uuid) to authenticated;


create or replace function public.superuser_revoke_company_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_company uuid;
  n int;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Only a Vertex platform superuser can revoke invitations here.' using errcode = '42501';
  end if;
  update public.company_invitations
     set status = 'revoked', revoked_at = now()
   where id = p_invitation_id and status = 'pending'
   returning company_id into v_company;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That invitation is no longer pending.' using errcode = 'P0002';
  end if;
  insert into public.audit_log_entries (company_id, user_id, action, module, record_type, record_id, reason)
  values (v_company, v_uid::text, 'permission_changed', 'platform', 'CompanyInvitation', p_invitation_id::text, 'Superuser revoked invitation');
end;
$$;

revoke all     on function public.superuser_revoke_company_invitation(uuid) from public;
revoke execute on function public.superuser_revoke_company_invitation(uuid) from anon;
grant  execute on function public.superuser_revoke_company_invitation(uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 8. bookkeeper — new fine-grained SYSTEM role
-- ═════════════════════════════════════════════════════════════════════
-- Decision (docs/SUPERUSER_PLATFORM_ADMIN.md § Roles): Vertex had NO
-- Bookkeeper role and Bookkeeper was NOT silently mapped to Accountant.
-- Added here as a fine-grained system role only — the `profile_role` enum
-- (the coarse access level) is deliberately UNCHANGED. Permission set:
-- day-to-day operational bookkeeping (sales, purchasing, banking incl.
-- reconciliation, VAT prep, fixed-asset capture, inventory counts). It
-- deliberately EXCLUDES: user_management (security administration),
-- audit:read, financial_periods:manage (period close), tax:post (final
-- submission), and the destructive/senior inventory actions
-- (delete / account_map / cost_edit).
insert into public.roles (name, description, is_custom, company_id)
select 'bookkeeper',
       'Day-to-day operational bookkeeping: sales, purchases, banking and reconciliation, VAT preparation, fixed-asset capture and stock counts. No user administration, period close or final tax submission.',
       false, null
where not exists (select 1 from public.roles where name = 'bookkeeper' and company_id is null);

with bk as (select id from public.roles where name = 'bookkeeper' and company_id is null),
     wanted(feature, action) as (values
       ('dashboard','read'),
       ('customer_management','create'), ('customer_management','read'),
       ('customer_management','update'), ('customer_management','delete'),
       ('supplier_management','create'), ('supplier_management','read'),
       ('supplier_management','update'), ('supplier_management','delete'),
       ('sales_documents','create'), ('sales_documents','read'), ('sales_documents','update'),
       ('sales_documents','post'), ('sales_documents','export'),
       ('invoicing','create'), ('invoicing','read'), ('invoicing','update'), ('invoicing','export'),
       ('purchasing','create'), ('purchasing','read'), ('purchasing','update'),
       ('purchasing','post'), ('purchasing','export'), ('purchasing','import'),
       ('banking','create'), ('banking','read'), ('banking','update'),
       ('banking','post'), ('banking','reconcile'),
       ('fulfilment','create'), ('fulfilment','read'), ('fulfilment','update'),
       ('fulfilment','post'), ('fulfilment','cancel'),
       ('gl','read'),
       ('reports','read'), ('reports','export'),
       ('tax','read'), ('tax','create'), ('tax','update'),
       ('assets','read'), ('assets','create'), ('assets','update'),
       ('inventory','read'), ('inventory','create'), ('inventory','update'),
       ('inventory','adjust'), ('inventory','opening_stock'),
       ('inventory','stocktake_post'), ('inventory','import'), ('inventory','export'),
       ('financial_periods','read'),
       ('payroll','read'),
       ('compliance','read')
     )
insert into public.role_permissions (role_id, permission_id, granted)
select bk.id, p.id, true
from bk
join public.permissions p on (p.feature, p.action) in (select feature, action from wanted)
on conflict (role_id, permission_id) do nothing;


-- ═════════════════════════════════════════════════════════════════════
-- 9. platform_admin_metrics() — one authoritative KPI aggregate
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.platform_admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totalClients',        (select count(*) from public.companies),
    'activeClients',       (select count(*) from public.companies where is_active),
    'suspendedClients',    (select count(*) from public.companies where not is_active),
    'totalUsers',          (select count(*) from public.profiles where role <> 'superuser'),
    'suspendedUsers',      (select count(*) from public.profiles where role <> 'superuser' and not is_active),
    'superusers',          (select count(*) from public.profiles where role = 'superuser'),
    'pendingInvitations',  (select count(*) from public.company_invitations where status = 'pending' and expires_at > now()),
    'expiredInvitations',  (select count(*) from public.company_invitations where status = 'pending' and expires_at <= now()),
    'managedSubscriptions',(select count(*) from public.subscriptions),
    'activeSubscriptions', (select count(*) from public.subscriptions where status in ('active','trialing')),
    'unmanagedClients',    (select count(*) from public.companies c where not exists (select 1 from public.subscriptions s where s.company_id = c.id)),
    'byPlan', (
      select coalesce(jsonb_object_agg(pl.code, cnt), '{}'::jsonb)
      from (
        select plan_id, count(*) cnt from public.subscriptions
        where status in ('active','trialing') group by plan_id
      ) x
      join public.subscription_plans pl on pl.id = x.plan_id
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all     on function public.platform_admin_metrics() from public;
revoke execute on function public.platform_admin_metrics() from anon;
grant  execute on function public.platform_admin_metrics() to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 10. platform_admin_company_users() — member directory incl. last sign-in
-- ═════════════════════════════════════════════════════════════════════
-- Superuser-only. Exposes a SAFE subset of auth.users (last_sign_in_at,
-- email_confirmed_at) joined to the company's profiles — never a password
-- hash, token, or recovery secret.
create or replace function public.platform_admin_company_users(p_company_id uuid)
returns table (
  id                uuid,
  email             text,
  first_name        text,
  last_name         text,
  profile_role      public.profile_role,
  is_active         boolean,
  joined_at         timestamptz,
  last_sign_in_at   timestamptz,
  email_confirmed   boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if (select auth.uid()) is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  return query
    select p.id, p.email, p.first_name, p.last_name, p.role, p.is_active,
           p.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.company_id = p_company_id
    order by p.created_at;
end;
$$;

revoke all     on function public.platform_admin_company_users(uuid) from public;
revoke execute on function public.platform_admin_company_users(uuid) from anon;
grant  execute on function public.platform_admin_company_users(uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 10b. platform_admin_client_setup() — configuration HEALTH, never balances
-- ═════════════════════════════════════════════════════════════════════
-- The Client Detail "Overview" tab shows whether a client's accounting is
-- set up — account count, financial-year presence, period count, whether an
-- active admin exists. Superuser-only. Reads only presence/counts from
-- accounts / financial_years / accounting_periods / profiles — NEVER a
-- balance, journal, invoice, customer or any figure.
create or replace function public.platform_admin_client_setup(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or public.get_my_role() is distinct from 'superuser' then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'accountCount',            (select count(*) from public.accounts where company_id = p_company_id),
    'financialYearConfigured', exists (select 1 from public.financial_years where company_id = p_company_id),
    'periodCount',             (select count(*) from public.accounting_periods where company_id = p_company_id),
    'hasActiveAdmin',          exists (select 1 from public.profiles where company_id = p_company_id and role = 'admin' and is_active),
    'memberCount',             (select count(*) from public.profiles where company_id = p_company_id)
  ) into v_result;
  return v_result;
end;
$$;

revoke all     on function public.platform_admin_client_setup(uuid) from public;
revoke execute on function public.platform_admin_client_setup(uuid) from anon;
grant  execute on function public.platform_admin_client_setup(uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 11. Observability
-- ═════════════════════════════════════════════════════════════════════
do $$
declare
  v_bk_perms int;
  v_fn       text;
begin
  if to_regprocedure('public.get_my_company_id()') is null then
    raise exception '0070: get_my_company_id() missing after replace';
  end if;

  foreach v_fn in array array[
    'public.my_workspace_suspended()',
    'public.set_company_suspended(uuid, boolean, text)',
    'public.superuser_set_subscription_plan(uuid, text, public.subscription_status)',
    'public.superuser_set_subscription_status(uuid, public.subscription_status)',
    'public.superuser_set_member_access(uuid, public.profile_role, boolean)',
    'public.superuser_remove_member_from_company(uuid)',
    'public.superuser_assign_role(uuid, uuid)',
    'public.superuser_unassign_role(uuid, uuid)',
    'public.superuser_create_company_invitation(uuid, text, public.profile_role, uuid)',
    'public.superuser_revoke_company_invitation(uuid)',
    'public.platform_admin_metrics()',
    'public.platform_admin_company_users(uuid)',
    'public.platform_admin_client_setup(uuid)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception '0070: function % was not created', v_fn;
    end if;
  end loop;

  if not exists (select 1 from public.roles where name = 'bookkeeper' and company_id is null) then
    raise exception '0070: bookkeeper system role was not created';
  end if;
  select count(*) into v_bk_perms
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  where r.name = 'bookkeeper' and r.company_id is null and rp.granted;
  if v_bk_perms < 40 then
    raise exception '0070: bookkeeper has only % permission grants, expected >= 40', v_bk_perms;
  end if;
  if exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'bookkeeper' and r.company_id is null and rp.granted
      and (p.feature = 'user_management'
           or (p.feature = 'audit' and p.action = 'read')
           or (p.feature = 'financial_periods' and p.action = 'manage')
           or (p.feature = 'tax' and p.action = 'post'))
  ) then
    raise exception '0070: bookkeeper was granted a forbidden permission (user_management / audit / period-close / tax:post)';
  end if;

  if not exists (select 1 from pg_policy where polname = 'audit_log_entries_select_superuser') then
    raise exception '0070: audit_log_entries_select_superuser policy missing';
  end if;

  if has_function_privilege('anon', 'public.platform_admin_metrics()', 'execute')
     or has_function_privilege('anon', 'public.set_company_suspended(uuid, boolean, text)', 'execute') then
    raise exception '0070: a superuser RPC is anon-executable';
  end if;

  raise notice '0070: OK — platform admin console DB surface in place (suspension enforcement, manual subscription override, member admin, bookkeeper role, metrics).';
end $$;
