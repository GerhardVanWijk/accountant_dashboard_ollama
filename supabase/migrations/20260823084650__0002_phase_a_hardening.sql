-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823084650 · name: 0002_phase_a_hardening

-- Fixes every real finding from get_advisors after 0001_bootstrap.

-- ---- security: lock down who may EXECUTE the two SECURITY DEFINER fns ----
revoke execute on function public.get_my_company_id() from public;
grant execute on function public.get_my_company_id() to authenticated;
-- anon gets nothing — no anon-facing policy references it.

revoke execute on function public.handle_new_user() from public;
-- No grants at all: this must only ever run via its own AFTER INSERT
-- trigger on auth.users, never called directly by a client.

-- ---- performance: index every FK column an RLS policy filters on --------
create index companies_reporting_framework_set_by_idx on public.companies(reporting_framework_set_by);
create index companies_sbc_eligibility_set_by_idx on public.companies(sbc_eligibility_set_by);
create index financial_years_company_id_idx on public.financial_years(company_id);
create index accounting_periods_company_id_idx on public.accounting_periods(company_id);
create index profiles_company_id_idx on public.profiles(company_id);

-- ---- performance: wrap auth.<fn>() calls so they evaluate once per query,
-- not once per row (Supabase's own documented RLS optimization pattern) ---
drop policy profiles_select_self_or_company on public.profiles;
create policy profiles_select_self_or_company on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or company_id = (select public.get_my_company_id()));

drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()));

drop policy companies_select_own on public.companies;
create policy companies_select_own on public.companies
  for select to authenticated using (id = (select public.get_my_company_id()));

drop policy companies_update_own on public.companies;
create policy companies_update_own on public.companies
  for update to authenticated using (id = (select public.get_my_company_id()));

drop policy companies_delete_own on public.companies;
create policy companies_delete_own on public.companies
  for delete to authenticated using (id = (select public.get_my_company_id()));

drop policy financial_years_all_own_company on public.financial_years;
create policy financial_years_all_own_company on public.financial_years
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

drop policy accounting_periods_all_own_company on public.accounting_periods;
create policy accounting_periods_all_own_company on public.accounting_periods
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

drop policy accounts_all_own_company on public.accounts;
create policy accounts_all_own_company on public.accounts
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
