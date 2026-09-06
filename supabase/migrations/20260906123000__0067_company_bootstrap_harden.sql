-- 0067_company_bootstrap_harden
-- COMMERCIAL FOUNDATION · BLOCK 1 — corrective follow-up to 0066 (2026-09-06,
-- branch commercial-foundation-2026-09-06). PRE-MERGE. `main` untouched.
--
-- 0066's scoped bootstrap branch in protect_profile_privileged_columns
-- keyed only on `new.company_id = vertex.bootstrap_company_id`. The primary
-- defence (a PostgREST/Supabase client cannot set that GUC — PostgREST
-- exposes no set_config and no RPC does) holds, but the branch was not
-- safe in isolation: if the GUC were somehow set, it would permit joining
-- ANY company (including a populated one) as admin, because it never
-- checked the target company was actually a brand-new empty shell.
--
-- Explicit adversarial test (rollback-wrapped, as `authenticated` with a
-- deliberately pre-set GUC) proved:
--   * GUC → existing demo company + bootstrap-shaped UPDATE  →  SUCCEEDED (bad)
--
-- FIX: the bootstrap branch now ALSO requires the target company to have
-- ZERO members and ZERO accounts — the invariant of a company row that was
-- just inserted and not yet linked to anyone (exactly the state
-- create_company_and_become_admin is in when it runs the profile UPDATE).
-- A real existing company always has ≥1 member (its admin), so it can never
-- be a bootstrap target. An attacker who inserts their OWN empty company
-- and bootstraps into it as admin gains nothing beyond "I now have my own
-- company", which every signup is already entitled to via the RPC.
--
-- After this: even with a client-set GUC, the branch can only ever do the
-- exact first-company bootstrap for the caller's own companyless 'viewer'
-- row into an empty company as 'admin'. No superuser grant, no joining
-- another company, no touching another user, no is_active change.
-- Re-proven by the same adversarial test — see docs/KNOWN_ISSUES.md.

create or replace function public.protect_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.get_my_role() = 'superuser' then
    return new;
  end if;

  -- SCOPED FIRST-COMPANY BOOTSTRAP (0066 + 0067 hardening). Permits EXACTLY
  -- the first-company bootstrap: the caller's own companyless 'viewer' row
  -- → 'admin' of one specific brand-new EMPTY company (no members, no
  -- accounts), is_active untouched. The GUC is set by
  -- create_company_and_become_admin around this UPDATE and cleared
  -- immediately; a client cannot set it, and even if it could every clause
  -- below must still hold.
  if nullif(current_setting('vertex.bootstrap_company_id', true), '') is not null
     and old.id = (select auth.uid())
     and old.company_id is null
     and old.role = 'viewer'
     and new.company_id is not null
     and new.company_id::text = current_setting('vertex.bootstrap_company_id', true)
     and new.role = 'admin'
     and new.is_active is not distinct from old.is_active
     and not exists (select 1 from public.profiles p where p.company_id = new.company_id)
     and not exists (select 1 from public.accounts a where a.company_id = new.company_id)
  then
    return new;
  end if;

  if public.get_my_role() = 'admin'
     and (old.company_id is not distinct from (select public.get_my_company_id()) or old.company_id is null) then
    if new.role = 'superuser' then
      new.role := old.role;
    end if;

    -- SELF-LOCKOUT PROTECTION (0065) — unchanged.
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

  new.role := old.role;
  new.company_id := old.company_id;
  new.is_active := old.is_active;
  return new;
end;
$$;

revoke all on function public.protect_profile_privileged_columns() from public;
revoke execute on function public.protect_profile_privileged_columns() from anon;
revoke execute on function public.protect_profile_privileged_columns() from authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.protect_profile_privileged_columns()', 'execute')
     or has_function_privilege('authenticated', 'public.protect_profile_privileged_columns()', 'execute') then
    raise exception '0067: protect_profile_privileged_columns must not be rpc-executable';
  end if;
  raise notice '0067: OK — bootstrap branch now requires an empty target company.';
end $$;
