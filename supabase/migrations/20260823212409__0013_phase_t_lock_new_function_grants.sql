-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823212409 · name: 0013_phase_t_lock_new_function_grants

-- Same ALTER DEFAULT PRIVILEGES landmine as 0003/0011: revoke explicitly
-- per-role, not just from public.
revoke execute on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text) from anon;
grant execute on function public.create_company_and_become_admin(text, public.legal_entity_type, smallint, smallint, text) to authenticated;

-- The trigger function fires automatically on UPDATE; it has no business
-- being callable directly via PostgREST's auto-exposed /rpc/ endpoint by
-- ANY role, authenticated or not.
revoke execute on function public.protect_profile_privileged_columns() from anon;
revoke execute on function public.protect_profile_privileged_columns() from authenticated;
