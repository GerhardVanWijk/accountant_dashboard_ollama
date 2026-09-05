-- 0065_secure_company_onboarding
-- FINAL USER MANAGEMENT / ONBOARDING SECURITY FIX (2026-09-05, branch
-- hardening-2026-09-05). PRE-MERGE correctness/security fix. `main` untouched.
--
-- Additive only: 1 new RPC, 1 trigger function REPLACED (adds self-lockout),
-- 1 new trigger + its function (user_roles company integrity). NO RLS policy
-- is created, dropped or altered. NO business / accounting table is touched.
-- Zero data rows written by this migration.
--
-- ═══════════════════════════════════════════════════════════════════════
-- PROBLEM 1 — "Add an existing user to my company" silently no-ops
-- ═══════════════════════════════════════════════════════════════════════
-- Live-verified 2026-09-05 (rollback-wrapped, as the real company admin):
--   The Users & Roles admin page finds an unassigned signup through
--   find_unassigned_profile_by_email (SECURITY DEFINER, migration 0014 —
--   works), then ProfileService.addExistingUserToCompany runs an ordinary
--     UPDATE public.profiles SET company_id = <company> WHERE id = <user>
--   That UPDATE matches 0 ROWS and returns NO error → the dialog reports
--   success but nothing happened.
--
--   Root cause: Postgres applies a table's SELECT policies to an UPDATE
--   whose WHERE clause reads a column. The target row has company_id IS
--   NULL, so profiles_select_self_or_company / profiles_select_superuser
--   (migrations 0002 / 0010) both hide it from a company admin — the row is
--   filtered out BEFORE profiles_update_admin_same_company (migration 0012,
--   whose USING deliberately includes `company_id IS NULL`) can act.
--   Proven: adding a temporary admin SELECT policy over company_id IS NULL
--   rows made the identical UPDATE succeed (1 row).
--
--   NOT fixed by broadening the profiles SELECT policy — that would expose
--   every pending signup's email/name to any company admin. Fixed with a
--   narrow SECURITY DEFINER RPC, same shape as create_company_and_become_admin
--   (0012) and find_unassigned_profile_by_email (0014): caller identity from
--   auth.uid() only, never trusted from the client; every precondition
--   validated; a controlled error on failure; 0 affected rows is NEVER
--   treated as success; the claim of an unassigned profile is serialised
--   with FOR UPDATE so two companies cannot both win.
--
-- ═══════════════════════════════════════════════════════════════════════
-- PROBLEM 2 — admin self-lockout was UI-disable only
-- ═══════════════════════════════════════════════════════════════════════
-- docs/PERMISSIONS.md "Admin self-lockout guard (UI-level, M11)" states the
-- backend does not stop an admin demoting / suspending themselves. A direct
-- service / API call could strip the caller's own administrator access.
-- protect_profile_privileged_columns (migrations 0012 / 0016) is extended so
-- an admin acting on their OWN row cannot drop their own 'admin' access
-- level or set their own is_active = false. Superuser and a no-auth.uid()
-- direct DB connection are returned early (unchanged) — both remain full
-- recovery paths, so no account can become unrecoverable.
--
-- ═══════════════════════════════════════════════════════════════════════
-- PROBLEM 3 — user_roles could reference a user in another / no company
-- ═══════════════════════════════════════════════════════════════════════
-- user_roles_insert_admin (migration 0012) checks only that the INSERTED
-- company_id is the caller's and the caller is an admin — never that the
-- target user actually belongs to that company. A new BEFORE INSERT/UPDATE
-- trigger closes that: a company-scoped role assignment now requires the
-- target profile's company_id to equal the row's company_id, and a custom
-- role to belong to that same company. Superuser / no-auth.uid() bypass,
-- matching every other layer.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ALSO — re-close a grant that migration 0016 silently re-opened
-- ═══════════════════════════════════════════════════════════════════════
-- This project has an ALTER DEFAULT PRIVILEGES rule that GRANTs EXECUTE on
-- every new public function to anon + authenticated at creation time
-- (see migrations 0003 / 0013). Migration 0016's `create or replace` of
-- protect_profile_privileged_columns re-granted what 0013 had revoked — it
-- is a trigger function and is currently flagged by the security advisor as
-- anon-/authenticated-executable via /rpc/. Since 0065 replaces the same
-- function again, it re-applies 0013's revokes. Same for the two functions
-- 0065 adds.


-- ═════════════════════════════════════════════════════════════════════
-- 1. Secure company-onboarding RPC
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.add_existing_user_to_company(
  p_user_id    uuid,
  p_company_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor         uuid := (select auth.uid());
  v_actor_role    public.profile_role;
  v_actor_company uuid;
  v_target        public.profiles;
begin
  -- (1) caller authenticated
  if v_actor is null then
    raise exception 'You must be signed in to do this.' using errcode = '42501';
  end if;

  if p_user_id is null or p_company_id is null then
    raise exception 'A user and a company are both required.' using errcode = '22004';
  end if;

  v_actor_role    := public.get_my_role();
  v_actor_company := public.get_my_company_id();

  -- (4) caller has sufficient administrative authority. get_my_role()/
  -- get_my_company_id() both filter is_active = true, so a suspended admin
  -- resolves to NULL here and is rejected.
  if v_actor_role is null or v_actor_role not in ('admin', 'superuser') then
    raise exception 'Only a company administrator can add a user to a company.' using errcode = '42501';
  end if;

  -- (2) requested company exists and is active
  if not exists (select 1 from public.companies c where c.id = p_company_id and c.is_active) then
    raise exception 'That company does not exist.' using errcode = 'P0002';
  end if;

  -- (3) caller administers THAT company. An admin is scoped to their own
  -- company; a superuser (no company of their own) may act for any company,
  -- matching the superuser bypass every other layer already grants and
  -- preserving superuser as a recovery path.
  if v_actor_role = 'admin' and p_company_id is distinct from v_actor_company then
    raise exception 'You can only add users to your own company.' using errcode = '42501';
  end if;

  -- (5) target profile exists — LOCK it so two companies cannot both claim
  -- the same unassigned signup. A concurrent caller blocks here, then
  -- re-reads the now-assigned row and is rejected at (6).
  select * into v_target from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'No user account was found for that request.' using errcode = 'P0002';
  end if;

  -- (9) never grant privileged status as a side effect — refuse to touch a
  -- superuser account at all (it also legitimately has no company).
  if v_target.role = 'superuser' then
    raise exception 'That account cannot be added to a company.' using errcode = '42501';
  end if;

  -- self-service is not an onboarding path (that is create_company_and_become_admin)
  if p_user_id = v_actor then
    raise exception 'You cannot add your own account to a company here.' using errcode = '42501';
  end if;

  -- (6)(7)(8) must be currently unassigned; never silently move between companies
  if v_target.company_id is not null then
    if v_target.company_id = p_company_id then
      -- idempotent: already exactly where the caller wants them. A safe
      -- retry / double-submit returns success without a second write.
      return jsonb_build_object('status', 'ALREADY_IN_COMPANY', 'user_id', p_user_id, 'company_id', p_company_id);
    end if;
    raise exception 'That person is already a member of a company and cannot be added to another.' using errcode = '42501';
  end if;

  -- (10) atomic assignment. company_id ONLY — role / is_active are left
  -- untouched, so no privileged-column drift. protect_profile_privileged_columns
  -- still runs on this UPDATE and still permits exactly this case (admin,
  -- old.company_id IS NULL, role unchanged).
  update public.profiles
     set company_id = p_company_id,
         updated_at = now()
   where id = p_user_id;

  if not found then
    -- defensive: the locked row must still be here. Never report success.
    raise exception 'The user could not be added to the company. Please try again.' using errcode = 'P0001';
  end if;

  insert into public.audit_log_entries
    (company_id, user_id, action, module, record_type, record_id, new_value, reason)
  values
    (p_company_id, v_actor::text, 'permission_changed', 'admin', 'Profile', p_user_id::text,
     jsonb_build_object('companyId', p_company_id), 'Added existing user to company');

  return jsonb_build_object('status', 'ASSIGNED', 'user_id', p_user_id, 'company_id', p_company_id);
end;
$$;

revoke all     on function public.add_existing_user_to_company(uuid, uuid) from public;
revoke execute on function public.add_existing_user_to_company(uuid, uuid) from anon;
grant  execute on function public.add_existing_user_to_company(uuid, uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 2. protect_profile_privileged_columns — + DB-level self-lockout
-- ═════════════════════════════════════════════════════════════════════
-- Unchanged from migration 0016 EXCEPT the SELF-LOCKOUT PROTECTION block
-- inside the admin branch.
create or replace function public.protect_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Trusted direct DB connection (no auth.uid()): the only path that can
  -- bootstrap the first superuser or recover a locked-out company. Unchanged.
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.get_my_role() = 'superuser' then
    return new;
  end if;

  if public.get_my_role() = 'admin'
     and (old.company_id is not distinct from (select public.get_my_company_id()) or old.company_id is null) then
    -- An admin may not grant superuser.
    if new.role = 'superuser' then
      new.role := old.role;
    end if;

    -- SELF-LOCKOUT PROTECTION (0065): an admin acting on their OWN row may
    -- not strip their own administrator access level, nor suspend
    -- themselves, through the ordinary profile-update path. Recovery for a
    -- genuinely locked-out admin stays with a superuser or a direct DB
    -- connection (both returned above). Acting on OTHER users is unaffected.
    -- new.id = old.id always (id is the immutable PK); compare on old.
    if old.id = (select auth.uid()) then
      if old.role = 'admin' and new.role is distinct from old.role then
        raise exception 'You cannot change your own administrator access level. Ask another administrator or a superuser to do it.'
          using errcode = '42501';
      end if;
      if old.is_active and not new.is_active then
        raise exception 'You cannot suspend your own account.'
          using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  -- Everyone else: privileged columns are pinned to their stored values.
  new.role := old.role;
  new.company_id := old.company_id;
  new.is_active := old.is_active;
  return new;
end;
$$;

-- Re-close the grant migration 0016's create-or-replace silently re-opened
-- (see header). The trigger still fires regardless of EXECUTE privilege.
revoke all on function public.protect_profile_privileged_columns() from public;
revoke execute on function public.protect_profile_privileged_columns() from anon;
revoke execute on function public.protect_profile_privileged_columns() from authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 3. user_roles company-integrity trigger
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.enforce_user_role_company_integrity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_target_company uuid;
  v_role_company   uuid;
begin
  -- superuser / trusted direct DB: bypass, matching every other layer.
  if (select auth.uid()) is null or public.get_my_role() = 'superuser' then
    return new;
  end if;

  select company_id into v_target_company from public.profiles where id = new.user_id;

  if v_target_company is null then
    raise exception 'That user is not a member of any company yet — add them to the company before assigning a role.'
      using errcode = '42501';
  end if;
  if v_target_company <> new.company_id then
    raise exception 'That user belongs to a different company.'
      using errcode = '42501';
  end if;

  select company_id into v_role_company from public.roles where id = new.role_id;
  if v_role_company is not null and v_role_company <> new.company_id then
    raise exception 'That role is not available to this company.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_user_role_company_integrity() from public;
revoke execute on function public.enforce_user_role_company_integrity() from anon;
revoke execute on function public.enforce_user_role_company_integrity() from authenticated;

drop trigger if exists user_roles_company_integrity on public.user_roles;
create trigger user_roles_company_integrity
  before insert or update on public.user_roles
  for each row execute function public.enforce_user_role_company_integrity();


-- ═════════════════════════════════════════════════════════════════════
-- 4. Observability
-- ═════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regprocedure('public.add_existing_user_to_company(uuid, uuid)') is null then
    raise exception '0065: add_existing_user_to_company was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'user_roles_company_integrity'
                 and tgrelid = 'public.user_roles'::regclass) then
    raise exception '0065: user_roles_company_integrity trigger was not created';
  end if;
  if has_function_privilege('anon', 'public.add_existing_user_to_company(uuid, uuid)', 'execute') then
    raise exception '0065: add_existing_user_to_company must not be anon-executable';
  end if;
  if not has_function_privilege('authenticated', 'public.add_existing_user_to_company(uuid, uuid)', 'execute') then
    raise exception '0065: add_existing_user_to_company must be authenticated-executable';
  end if;
  if has_function_privilege('anon', 'public.protect_profile_privileged_columns()', 'execute')
     or has_function_privilege('authenticated', 'public.protect_profile_privileged_columns()', 'execute') then
    raise exception '0065: protect_profile_privileged_columns must not be rpc-executable';
  end if;
  raise notice '0065: OK — onboarding RPC + self-lockout + user_roles integrity in place.';
end $$;
