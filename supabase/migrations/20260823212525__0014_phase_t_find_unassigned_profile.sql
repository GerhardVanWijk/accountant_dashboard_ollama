-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823212525 · name: 0014_phase_t_find_unassigned_profile

-- Admin "add an existing user to my company" needs to look up ONE specific
-- unassigned (company_id IS NULL) profile by exact email. A broad SELECT
-- policy on unassigned rows would leak every pending signup's email to any
-- authenticated user who queries broadly; this RPC instead returns at most
-- the single exact-match row, and only to a caller whose own role is
-- 'admin'.
create or replace function public.find_unassigned_profile_by_email(p_email text)
returns table (id uuid, email text, first_name text, last_name text)
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'Only a company admin may look up unassigned users.';
  end if;

  return query
    select p.id, p.email, p.first_name, p.last_name
    from public.profiles p
    where p.company_id is null and p.email = p_email;
end;
$$;

revoke all on function public.find_unassigned_profile_by_email(text) from public;
revoke execute on function public.find_unassigned_profile_by_email(text) from anon;
grant execute on function public.find_unassigned_profile_by_email(text) to authenticated;
