-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823212834 · name: 0015_phase_t_enforce_is_active

-- Real pre-existing gap found while wiring the Suspend User button:
-- profiles.is_active (part of the original Phase A schema) was never
-- checked by any RLS policy anywhere -- a "suspended" user could still
-- fully use the app. Fixed at the two shared helper functions every one
-- of the ~45 company-scoped tables' policies already call, rather than
-- touching any of those 45 tables: an inactive profile now resolves to
-- NULL company/role, which every existing "company_id = get_my_company_id()"
-- policy already treats as zero access (NULL never equals anything) --
-- the same mechanism that already locks the superuser out by construction.
create or replace function public.get_my_company_id() returns uuid
language sql stable security definer set search_path = public
as $$ select company_id from public.profiles where id = (select auth.uid()) and is_active = true $$;

create or replace function public.get_my_role() returns public.profile_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = (select auth.uid()) and is_active = true $$;
