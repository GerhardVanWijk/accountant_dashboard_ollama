-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823235126 · name: 0016_phase_t_allow_direct_db_admin_bypass

-- Real gap found bootstrapping the first superuser: protect_profile_privileged_columns
-- (migration 0012) blocked even a direct, trusted database admin connection
-- (e.g. via the Supabase SQL editor or an MCP admin session) from setting
-- role/company_id/is_active, because it saw no auth.uid() session and fell
-- into the same lockdown branch a plain anonymous client update would hit.
-- A direct DB connection with no auth.uid() at all is inherently more
-- trusted than any RLS-scoped app session ever is (it requires the
-- project's own database credentials, not a user JWT) -- there must be
-- SOME legitimate path to create the first superuser, since nothing in the
-- app can grant that role to anyone.
create or replace function public.protect_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.get_my_role() = 'superuser' then
    return new;
  end if;

  if public.get_my_role() = 'admin' and (old.company_id is not distinct from (select public.get_my_company_id()) or old.company_id is null) then
    if new.role = 'superuser' then
      new.role := old.role;
    end if;
    return new;
  end if;

  new.role := old.role;
  new.company_id := old.company_id;
  new.is_active := old.is_active;
  return new;
end;
$$;
