-- 0078_data_migration_centre_permissions
-- Registers the Data Import & Migration Centre in the fine-grained
-- permissions catalog (migration 0010, `permissions(feature, action)` /
-- `role_permissions`). Ported from SLC's 0070/0072 (their final granted
-- state), adapted to Vertex's real system-role catalog:
--   {accountant, bookkeeper, employee, finance_manager, sales_manager,
--    stock_controller, viewer}.
--
-- Action vocabulary follows the existing convention
-- (read/create/update/export) plus 'import' (the exact action name every
-- ImportAdapter.permission already uses).
--
-- Data migration is an accounting-sensitive administrative capability.
-- Migration source files can carry complete customer/supplier/banking/
-- accounting detail, so ordinary read-only application access must not imply
-- access to raw migration files. Grants:
--   accountant, finance_manager, bookkeeper: read, import, create, update,
--     export (the roles that would actually run or reconcile a migration)
--   employee, sales_manager, stock_controller, viewer: no grant
-- admin/superuser bypass entirely via useCanAccess()'s existing rule — no
-- duplicate bypass permission row added here.

insert into public.permissions (feature, action) values
  ('data_migration', 'read'),
  ('data_migration', 'import'),
  ('data_migration', 'create'),
  ('data_migration', 'update'),
  ('data_migration', 'export')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.roles r
cross join public.permissions p
where r.company_id is null
  and r.name in ('accountant', 'finance_manager', 'bookkeeper')
  and p.feature = 'data_migration'
  and p.action in ('read', 'import', 'create', 'update', 'export')
on conflict (role_id, permission_id) do nothing;
