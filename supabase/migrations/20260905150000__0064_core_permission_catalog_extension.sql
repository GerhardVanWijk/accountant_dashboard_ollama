-- 0064_core_permission_catalog_extension
-- FINAL CORE HARDENING (2026-09-05, branch hardening-2026-09-05).
-- Closes the app-wide permission-catalog gap documented in docs/PERMISSIONS.md
-- ("Ungated areas") under the APPROVED permission policy in the FINAL CORE
-- HARDENING BLOCK brief.
--
-- ══════════════════════════════════════════════════════════════════════
-- SCOPE
--   Additive ONLY. Extends the SAME Phase T fine-grained catalog
--   (public.permissions / public.role_permissions, migrations 0010 / 0030)
--   used by useCanAccess() / <PermissionRoute> — it is NOT a parallel
--   system. No RLS policy is touched: Supabase RLS keyed off profiles.role
--   remains the ONLY database security boundary and the tenant isolation
--   semantics are unchanged (brief: "Do not weaken Supabase RLS", "Do not
--   change tenant isolation semantics").
--
-- NO LOCKOUT (brief §3 — verified read-only against live data at authoring):
--   * public.user_roles has 0 assignments.
--   * The only profiles that can pass RouteGuard (signed in AND has a
--     company) are 1 admin + 0 non-admin; the 4 viewer-role profiles have
--     company_id = NULL and never reach the gated app shell.
--   * admin / superuser bypass useCanAccess() unconditionally, so route/
--     action gates never apply to them.
--   => Adding these gates locks NOBODY out today. This migration writes
--      ZERO user_roles rows and ZERO profiles changes. Transition guidance
--      for administrators: before assigning any real user a non-admin
--      profile role, assign them one of the 6 system fine-grained roles
--      (each keeps broad :read via the grants below).
--
-- FEATURES ADDED (meaningful feature/action boundaries — not one-per-route):
--   sales_documents   Quotes, Sales Orders, Credit Notes, Customer Receipts
--                     (the AR / commercial sales side; posted Invoices stay
--                      under the existing `invoicing` feature)
--   fulfilment        Delivery Notes, Return Notes (physical dispatch/return
--                     of stock — NO revenue/VAT/AR effect; the documents the
--                     approved policy lets stock_controller post)
--   purchasing        Purchase Orders, Bills, Supplier Payments, Vendor
--                     detail actions
--   banking           Bank accounts, bank transactions, bank reconciliation
--   assets            Fixed-asset register, depreciation, disposals, tax
--                     (wear-and-tear) register
--   tax               VAT201, Income Tax, CGT, Dividends Tax, Provisional
--                     Tax, Deferred Tax, ECL, tax rates
--   compliance        Compliance dashboard, Public Interest Score, Reporting
--                     Standards, Related Parties, Foreign Exchange, Leases
--   financial_periods  Open / soft-close / close / lock / reopen periods
--   audit             Access Log + business Audit Trail (read-only screens)
--
-- ACTION VOCABULARY: the existing read/create/update/delete/export/import,
--   plus `post`   — the accounting/commercial-effect transition (confirm SO,
--                    post DN, issue CN, post Bill, record Payment, capitalize
--                    / depreciate / dispose an asset, post a tax computation)
--   plus `cancel` — void/cancel a fulfilment document
--   plus `reconcile` — perform a bank reconciliation
--   plus `manage` — administer financial periods (open/close/lock/reopen)
--
-- ROLE GRANTS: every grant mirrors the shape the role already has on an
--   analogous existing feature (see docs/PERMISSIONS.md "PROPOSED" table and
--   the brief's APPROVED PERMISSION POLICY). admin/superuser: nothing seeded
--   (bypass). Rationale per role is in docs/PERMISSIONS.md.

-- ──────────────────────────────────────────────────────────────────────
-- 1. Permission rows
-- ──────────────────────────────────────────────────────────────────────
insert into public.permissions (feature, action, description) values
  ('sales_documents',   'read',      'View quotes, sales orders, credit notes and customer receipts'),
  ('sales_documents',   'create',    'Create quotes, sales orders, credit notes and customer receipts'),
  ('sales_documents',   'update',    'Edit draft quotes, sales orders, credit notes and receipts'),
  ('sales_documents',   'delete',    'Delete draft quotes, sales orders, credit notes and receipts'),
  ('sales_documents',   'post',      'Confirm a sales order, issue a credit note, record a customer receipt'),
  ('sales_documents',   'export',    'Export / print quotes, sales orders, credit notes and receipts'),

  ('fulfilment',        'read',      'View delivery notes and return notes'),
  ('fulfilment',        'create',    'Create draft delivery notes and return notes'),
  ('fulfilment',        'update',    'Edit draft delivery notes and return notes'),
  ('fulfilment',        'post',      'Post a delivery note or return note (physical stock movement, no revenue/VAT/AR)'),
  ('fulfilment',        'cancel',    'Cancel / void a delivery note or return note'),

  ('purchasing',        'read',      'View purchase orders, bills, supplier payments and vendor activity'),
  ('purchasing',        'create',    'Create purchase orders, bills and supplier payments'),
  ('purchasing',        'update',    'Edit draft purchase orders, bills and supplier payments'),
  ('purchasing',        'delete',    'Delete draft purchase orders, bills and supplier payments'),
  ('purchasing',        'post',      'Confirm a purchase order, post a bill, record a supplier payment'),
  ('purchasing',        'export',    'Export / print purchasing documents and vendor aging'),
  ('purchasing',        'import',    'Import purchase orders / bills'),

  ('banking',           'read',      'View bank accounts, bank transactions and reconciliations'),
  ('banking',           'create',    'Add bank accounts and bank transactions / statement imports'),
  ('banking',           'update',    'Edit bank accounts and bank transaction allocations'),
  ('banking',           'delete',    'Delete bank accounts and unreconciled bank transactions'),
  ('banking',           'post',      'Post bank transaction allocations / split entries to the GL'),
  ('banking',           'reconcile', 'Perform and finalise a bank reconciliation'),

  ('assets',            'read',      'View the fixed-asset register, depreciation and disposals'),
  ('assets',            'create',    'Create draft fixed assets'),
  ('assets',            'update',    'Edit draft fixed assets and depreciation settings'),
  ('assets',            'delete',    'Delete draft fixed assets'),
  ('assets',            'post',      'Capitalize, run depreciation, or dispose of a fixed asset'),

  ('tax',               'read',      'View VAT201, income tax, CGT, dividends, provisional, deferred tax, ECL'),
  ('tax',               'create',    'Create tax computations and tax rates'),
  ('tax',               'update',    'Edit draft tax computations and tax rates'),
  ('tax',               'post',      'Post / finalise a tax computation or VAT return'),

  ('compliance',        'read',      'View compliance dashboard, PIS, reporting standards, related parties, FX, leases'),
  ('compliance',        'update',    'Maintain the related-party register, framework overrides, FX rates, lease amortization'),

  ('financial_periods', 'read',      'View accounting periods and their status'),
  ('financial_periods', 'manage',    'Open, soft-close, close, lock or reopen an accounting period'),

  ('audit',             'read',      'View the Access Log and the business Audit Trail')
on conflict (feature, action) do nothing;

-- ──────────────────────────────────────────────────────────────────────
-- 2. System-role grants (company_id is null = system role, shared by every tenant)
-- ──────────────────────────────────────────────────────────────────────
with grant_map(role_name, feature, action) as (
  values
    -- viewer: reads everything it is allowed to, plus the two document exports
    -- it already has on `invoicing`/`reports` shape. NO audit (finance-only).
    ('viewer','sales_documents','read'), ('viewer','sales_documents','export'),
    ('viewer','fulfilment','read'),
    ('viewer','purchasing','read'), ('viewer','purchasing','export'),
    ('viewer','banking','read'),
    ('viewer','assets','read'),
    ('viewer','tax','read'),
    ('viewer','compliance','read'),
    ('viewer','financial_periods','read'),

    -- employee: minimal operational read only
    ('employee','sales_documents','read'),
    ('employee','fulfilment','read'),
    ('employee','purchasing','read'),

    -- sales_manager: full sales_documents CRUD+post+export (same shape as its
    -- existing `invoicing` grant), fulfilment create/post (ships goods where
    -- the workflow needs it), read-only purchasing. NO financial admin.
    ('sales_manager','sales_documents','read'), ('sales_manager','sales_documents','create'),
    ('sales_manager','sales_documents','update'), ('sales_manager','sales_documents','delete'),
    ('sales_manager','sales_documents','post'), ('sales_manager','sales_documents','export'),
    ('sales_manager','fulfilment','read'), ('sales_manager','fulfilment','create'),
    ('sales_manager','fulfilment','update'), ('sales_manager','fulfilment','post'),
    ('sales_manager','fulfilment','cancel'),
    ('sales_manager','purchasing','read'),

    -- stock_controller: owns physical stock. Full fulfilment (DN/RN post +
    -- cancel), purchasing CRUD + import/export (POs affect stock — mirrors its
    -- `inventory` grant), read-only sales_documents. NO purchasing:post
    -- (Bill/Payment = accounting), NO sales_documents:post (no CN issue).
    ('stock_controller','sales_documents','read'),
    ('stock_controller','fulfilment','read'), ('stock_controller','fulfilment','create'),
    ('stock_controller','fulfilment','update'), ('stock_controller','fulfilment','post'),
    ('stock_controller','fulfilment','cancel'),
    ('stock_controller','purchasing','read'), ('stock_controller','purchasing','create'),
    ('stock_controller','purchasing','update'), ('stock_controller','purchasing','delete'),
    ('stock_controller','purchasing','export'), ('stock_controller','purchasing','import'),

    -- finance_manager: read + export everywhere, plus audit:read — mirrors its
    -- read-heavy `reports`/`gl` shape. No mutation.
    ('finance_manager','sales_documents','read'), ('finance_manager','sales_documents','export'),
    ('finance_manager','fulfilment','read'),
    ('finance_manager','purchasing','read'), ('finance_manager','purchasing','export'),
    ('finance_manager','banking','read'),
    ('finance_manager','assets','read'),
    ('finance_manager','tax','read'),
    ('finance_manager','compliance','read'),
    ('finance_manager','financial_periods','read'),
    ('finance_manager','audit','read'),

    -- accountant: near-full CRUD + post + export on every new feature — mirrors
    -- its broad current grant. EXCLUDES user/security administration (that
    -- stays `user_management`, unchanged).
    ('accountant','sales_documents','read'), ('accountant','sales_documents','create'),
    ('accountant','sales_documents','update'), ('accountant','sales_documents','delete'),
    ('accountant','sales_documents','post'), ('accountant','sales_documents','export'),
    ('accountant','fulfilment','read'), ('accountant','fulfilment','create'),
    ('accountant','fulfilment','update'), ('accountant','fulfilment','post'),
    ('accountant','fulfilment','cancel'),
    ('accountant','purchasing','read'), ('accountant','purchasing','create'),
    ('accountant','purchasing','update'), ('accountant','purchasing','delete'),
    ('accountant','purchasing','post'), ('accountant','purchasing','export'),
    ('accountant','purchasing','import'),
    ('accountant','banking','read'), ('accountant','banking','create'),
    ('accountant','banking','update'), ('accountant','banking','delete'),
    ('accountant','banking','post'), ('accountant','banking','reconcile'),
    ('accountant','assets','read'), ('accountant','assets','create'),
    ('accountant','assets','update'), ('accountant','assets','delete'),
    ('accountant','assets','post'),
    ('accountant','tax','read'), ('accountant','tax','create'),
    ('accountant','tax','update'), ('accountant','tax','post'),
    ('accountant','compliance','read'), ('accountant','compliance','update'),
    ('accountant','financial_periods','read'), ('accountant','financial_periods','manage'),
    ('accountant','audit','read')
)
insert into public.role_permissions (role_id, permission_id, granted)
select r.id, p.id, true
from grant_map g
join public.roles r on r.company_id is null and r.name = g.role_name
join public.permissions p on p.feature = g.feature and p.action = g.action
on conflict (role_id, permission_id) do nothing;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Observability
-- ──────────────────────────────────────────────────────────────────────
do $$
declare v_perms int; v_grants int;
begin
  select count(*) into v_perms from public.permissions
   where feature in ('sales_documents','fulfilment','purchasing','banking','assets','tax','compliance','financial_periods','audit');
  select count(*) into v_grants from public.role_permissions rp
   join public.permissions p on p.id = rp.permission_id
   where p.feature in ('sales_documents','fulfilment','purchasing','banking','assets','tax','compliance','financial_periods','audit');
  raise notice '0064: % new-feature permission rows, % role grants (expected 38 / 86).', v_perms, v_grants;
  if v_grants <> 86 then
    raise exception '0064: expected 86 new-feature role grants, got % — aborting.', v_grants;
  end if;
  if v_perms <> 38 then
    raise exception '0064: expected 38 new-feature permission rows, got % — aborting.', v_perms;
  end if;
end $$;
