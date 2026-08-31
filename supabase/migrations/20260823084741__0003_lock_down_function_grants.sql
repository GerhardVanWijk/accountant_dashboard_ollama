-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823084741 · name: 0003_lock_down_function_grants

-- 0002's `revoke ... from public` didn't work: this project has an
-- ALTER DEFAULT PRIVILEGES rule granting EXECUTE on every new public
-- function directly to anon/authenticated at creation time, bypassing the
-- generic PUBLIC pseudo-role. Revoke explicitly, per role, per function.

revoke execute on function public.get_my_company_id() from anon;
revoke execute on function public.get_my_company_id() from authenticated;
grant execute on function public.get_my_company_id() to authenticated;
-- anon: no grant at all — intentional, nothing anon-facing needs it.

revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
-- No grants to anyone — must only ever run via its own AFTER INSERT trigger.
