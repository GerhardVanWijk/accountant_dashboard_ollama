-- 0030_inventory_permissions
-- Inventory Accounting Module — Phase 2 (Review 2C Hybrid). AUTHORED, NOT YET APPLIED.
--
-- New fine-grained inventory sub-actions for the sensitive operations. These are
-- used for APPLICATION / UI / SERVICE authorization (useCanAccess) only.
--
-- Database RLS on the inventory tables stays the coarse company-tenant model
-- used by every other module (see 0027–0029). Review 2C decision: a role-aware
-- DB-authorization architecture must be applied APPLICATION-WIDE in a dedicated
-- later phase (with user_roles population, admin/staff mapping, lockout
-- prevention, rollout and tests) — not introduced for Inventory alone. The
-- `user_roles` table currently has 0 rows, so an Inventory-only DB permission
-- gate would lock ordinary authenticated users out of these tables. That task is
-- tracked in docs/CURRENT_TASKS.md. No privileged DB function is created here;
-- this migration only seeds catalog rows.
--
--   inventory:adjust          — create / post a stock adjustment or supplier return
--   inventory:stocktake_post  — post a stock take
--   inventory:cost_edit       — override a product cost price directly
--   inventory:opening_stock   — confirm an opening-stock batch (posts to GL)
--   inventory:account_map     — edit product-category / product account mappings
--   inventory:import          — run an inventory / product / stock-count import
--
-- Grant defaults: 'accountant' and 'stock_controller' get all six; every other
-- system role gets none (mirrors migration 0010's precedent of documenting grant
-- choices rather than guessing). The permissions table is system-managed
-- (seed-only, per its RLS).

insert into public.permissions (feature, action) values
  ('inventory', 'adjust'),
  ('inventory', 'stocktake_post'),
  ('inventory', 'cost_edit'),
  ('inventory', 'opening_stock'),
  ('inventory', 'account_map'),
  ('inventory', 'import')
on conflict (feature, action) do nothing;

insert into public.role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from public.roles r
cross join public.permissions p
where r.company_id is null
  and r.name in ('accountant', 'stock_controller')
  and p.feature = 'inventory'
  and p.action in ('adjust', 'stocktake_post', 'cost_edit', 'opening_stock', 'account_map', 'import')
on conflict (role_id, permission_id) do nothing;
