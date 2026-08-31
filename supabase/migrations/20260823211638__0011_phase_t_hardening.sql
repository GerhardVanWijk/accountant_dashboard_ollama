-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260823211638 · name: 0011_phase_t_hardening

-- Same landmine 0003 hit for get_my_company_id(): this project's
-- ALTER DEFAULT PRIVILEGES rule grants EXECUTE on every new public
-- function to anon/authenticated directly at creation time, bypassing
-- the PUBLIC pseudo-role revoke in 0010. Explicit per-role revoke here.
revoke execute on function public.get_my_role() from anon;
revoke execute on function public.get_my_role() from public;
grant execute on function public.get_my_role() to authenticated;

-- role_permissions_write_custom was declared FOR ALL, which duplicates
-- role_permissions_select's SELECT coverage (multiple_permissive_policies
-- advisor). Split into write-only policies.
drop policy "role_permissions_write_custom" on public.role_permissions;

create policy "role_permissions_insert_custom" on public.role_permissions
  for insert to authenticated with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id and r.is_custom = true and r.company_id = (select public.get_my_company_id())
    )
    and public.get_my_role() = 'admin'
  );

create policy "role_permissions_update_custom" on public.role_permissions
  for update to authenticated using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id and r.is_custom = true and r.company_id = (select public.get_my_company_id())
    )
    and public.get_my_role() = 'admin'
  ) with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id and r.is_custom = true and r.company_id = (select public.get_my_company_id())
    )
  );

create policy "role_permissions_delete_custom" on public.role_permissions
  for delete to authenticated using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id and r.is_custom = true and r.company_id = (select public.get_my_company_id())
    )
    and public.get_my_role() = 'admin'
  );

-- Missing covering indexes on FK columns (unindexed_foreign_keys advisor),
-- same rationale as 0002_phase_a_hardening.
create index if not exists audit_logs_access_actor_id_idx on public.audit_logs_access (actor_id);
create index if not exists user_roles_assigned_by_idx on public.user_roles (assigned_by);
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);
