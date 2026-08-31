-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823212353 · name: 0012_phase_t_profile_privilege_protection

-- Real pre-existing gap found while building Phase T onboarding:
-- profiles_update_self (0001_bootstrap) has USING (id = auth.uid()) with
-- NO with_check and no column-level restriction -- any authenticated user
-- could self-elevate role to 'admin'/'superuser' or jump company_id into
-- any other tenant via a plain client .update(). RLS is row-level, not
-- column-level, so the fix is a BEFORE UPDATE trigger that locks the
-- privileged columns unless the caller is superuser (any row) or admin
-- (rows in their own company, and never able to grant 'superuser').

create or replace function public.protect_profile_privileged_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() = 'superuser' then
    return new;
  end if;

  if public.get_my_role() = 'admin' and (old.company_id is not distinct from (select public.get_my_company_id()) or old.company_id is null) then
    if new.role = 'superuser' then
      new.role := old.role;
    end if;
    return new;
  end if;

  -- Plain self-update (or anyone else the row-level policies let through):
  -- role/company_id/is_active are locked to their previous values.
  new.role := old.role;
  new.company_id := old.company_id;
  new.is_active := old.is_active;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- New: a company admin may update profiles that are either already in
-- their own company, or unassigned (company_id IS NULL) -- the latter is
-- what lets an admin onboard a fresh signup into their company from the
-- Users & Roles admin UI. The trigger above still blocks granting
-- 'superuser' and still locks company_id/role for a plain self-update.
create policy "profiles_update_admin_same_company" on public.profiles
  for update to authenticated using (
    public.get_my_role() = 'admin' and (company_id = (select public.get_my_company_id()) or company_id is null)
  ) with check (
    company_id = (select public.get_my_company_id())
  );

-- Onboarding RPC: create a company and become its admin in one atomic,
-- SECURITY DEFINER step (bypasses the self-update trigger above by design
-- -- that trigger exists specifically to stop a *plain client update* from
-- doing this, not to block this narrow, server-validated path). A caller
-- who already belongs to a company is rejected.
create or replace function public.create_company_and_become_admin(
  p_name text,
  p_legal_entity_type public.legal_entity_type,
  p_financial_year_end_month smallint,
  p_financial_year_end_day smallint,
  p_functional_currency text default 'ZAR'
) returns public.companies
language plpgsql security definer set search_path = public as $$
declare
  v_company public.companies;
  v_existing_company_id uuid;
begin
  select company_id into v_existing_company_id from public.profiles where id = (select auth.uid());
  if v_existing_company_id is not null then
    raise exception 'You already belong to a company.';
  end if;

  insert into public.companies (name, legal_entity_type, financial_year_end_month, financial_year_end_day, functional_currency, presentation_currency)
  values (p_name, p_legal_entity_type, p_financial_year_end_month, p_financial_year_end_day, p_functional_currency, p_functional_currency)
  returning * into v_company;

  update public.profiles set company_id = v_company.id, role = 'admin' where id = (select auth.uid());

  return v_company;
end;
$$;

revoke all on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text) from public;
grant execute on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text) to authenticated;
