-- 0068_subscription_plan_entitlements
-- COMMERCIAL FOUNDATION · BLOCK 3 — the provider-independent commercial
-- model (2026-09-06, branch commercial-foundation-2026-09-06). PRE-MERGE.
-- `main` untouched. NO payments processed. NO real user marked paid.
--
-- ═══════════════════════════════════════════════════════════════════════
-- THREE-LAYER ACCESS (docs/PLAN_ENTITLEMENTS.md, docs/PERMISSIONS.md)
--   1. SUBSCRIPTION  — is Vertex commercially active for this company?
--   2. ENTITLEMENT   — does the purchased plan include this module?   ← THIS FILE
--   3. PERMISSION    — may this user perform this action?  (0064/0065, unchanged)
--   effective access = (1) AND (2) AND (3). A company Admin does NOT
--   bypass (2); superuser/support does, explicitly and auditably.
--
-- ═══════════════════════════════════════════════════════════════════════
-- WHAT THIS ADDS  (all additive — no existing table/policy/RPC changed
-- except three NEW inventory-write triggers as the enforcement scaffold)
--   subscription_features  — the entitlement catalogue (feature keys)
--   subscription_plans     — Starter / Growth / Premium, seeded from the
--                            audited public pricing (src/features/marketing/
--                            content.ts). DB is now the source of truth;
--                            the pricing page renders from it.
--   plan_features          — which features each plan includes
--   subscriptions          — one row per company once Paystack activates it
--   subscription_events    — append-only audit of every subscription change
--   company_entitlements() / company_has_entitlement() / require_entitlement()
--                          — the ONE authoritative resolver, used by both
--                            the frontend and server-side enforcement.
--
-- TRANSITION (no lockout, same principle as the 0064 permission catalogue):
--   a company with NO `subscriptions` row is treated as FULLY ENTITLED
--   ("unmanaged" / grandfathered). The only live company (the demo) is
--   unmanaged, so nothing changes for it. Once Paystack is connected, every
--   new company gets a subscription row and unmanaged = legacy only.
--
-- BILLING SEPARATION: this is PLATFORM billing for Vertex itself. It never
-- touches a customer's accounting ledger — no journal entries, no GL
-- accounts, no effect on Trial Balance.


-- ═════════════════════════════════════════════════════════════════════
-- 1. Entitlement catalogue
-- ═════════════════════════════════════════════════════════════════════
create table public.subscription_features (
  key           text primary key,
  name          text not null,
  description   text,
  is_core       boolean not null default false,   -- always available, any plan / no plan
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);
comment on table public.subscription_features is 'Stable entitlement keys — the module/feature boundaries a plan can unlock. Mirrors the shape of public.permissions.';

alter table public.subscription_features enable row level security;
create policy subscription_features_read_all on public.subscription_features
  for select to anon, authenticated using (true);

insert into public.subscription_features (key, name, description, is_core, display_order) values
  ('dashboard',            'Dashboard',                     'Business overview and recent activity',                               true,  0),
  ('customers',            'Customers',                     'Customer records and contacts',                                      true,  1),
  ('suppliers',            'Suppliers',                     'Supplier / vendor records',                                          true,  2),
  ('user_management',      'Users & access',                'Add colleagues, assign access levels and roles',                     true,  3),
  ('settings',             'Settings',                      'Company profile, document and accounting settings',                  true,  4),
  ('sales',                'Invoicing & quotes',            'Quotes, sales orders, tax invoices, delivery notes and return notes', false, 10),
  ('sales_receipts',       'Credit notes & receipts',       'Credit notes, customer receipts and customer deposits',              false, 11),
  ('purchasing',           'Bills & expenses',              'Supplier bills, expenses and purchase orders',                       false, 12),
  ('purchasing_payments',  'Supplier payments & aging',     'Record supplier payments and track vendor aging',                    false, 13),
  ('banking',              'Bank import & reconciliation',  'Statement import, matching and zero-variance reconciliation',        false, 14),
  ('vat',                  'VAT',                           'VAT201 preparation and tax rates',                                   false, 15),
  ('income_tax',           'Income & provisional tax',      'Company income tax and provisional tax computations',                false, 16),
  ('advanced_tax',         'Advanced tax',                  'Capital gains, dividends tax, deferred tax and expected credit losses', false, 17),
  ('general_ledger',       'General ledger',                'Chart of accounts, journals, trial balance and financial periods',   false, 18),
  ('financial_statements', 'Financial statements',          'Income Statement, Balance Sheet, Cash Flow, aging and forecasting',   false, 19),
  ('assets',               'Fixed asset register',          'Record and track fixed assets',                                      false, 20),
  ('assets_depreciation',  'Depreciation & disposals',      'Run depreciation, dispose of assets, SARS wear-and-tear register',   false, 21),
  ('inventory',            'Inventory & warehouses',        'Stock, warehouses, movements, adjustments, transfers and stock takes', false, 22),
  ('compliance',           'Compliance & related parties',  'Compliance dashboard, reporting standards, PIS, related parties, leases', false, 23),
  ('audit_trail',          'Audit trail',                   'Full business audit trail and access log',                           false, 24),
  ('payroll',              'Payroll',                       'Employees, payroll runs, PAYE / UIF / SDL, EMP201 and EMP501',        false, 30),
  ('foreign_exchange',     'Foreign exchange toolkit',      'Exchange rates and FX gain/loss calculator',                         false, 31);


-- ═════════════════════════════════════════════════════════════════════
-- 2. Plans
-- ═════════════════════════════════════════════════════════════════════
create table public.subscription_plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,               -- 'starter' | 'growth' | 'premium'
  name             text not null,
  blurb            text,
  price_cents      int not null check (price_cents >= 0),
  currency         text not null default 'ZAR',
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annual')),
  included_users   int not null default 1 check (included_users >= 1),
  is_active        boolean not null default true,
  is_public        boolean not null default true,      -- shown on the public pricing page
  display_order    int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.subscription_plans is 'PLATFORM subscription plans for Vertex itself. Seeded from the audited public pricing (src/features/marketing/content.ts). This table is the source of truth; the pricing page renders from it.';

alter table public.subscription_plans enable row level security;
create policy subscription_plans_read_active on public.subscription_plans
  for select to anon, authenticated using (is_active);

-- prices ex-VAT, ZAR, monthly — verbatim from the audited pricing model.
insert into public.subscription_plans (code, name, blurb, price_cents, included_users, display_order) values
  ('starter', 'Starter', 'Essential bookkeeping for sole proprietors and small businesses.',   19900, 1, 0),
  ('growth',  'Growth',  'Complete accounting for growing businesses and bookkeepers.',         44900, 3, 1),
  ('premium', 'Premium', 'Advanced accounting, reporting and operational tools for established businesses.', 89900, 10, 2);


-- ═════════════════════════════════════════════════════════════════════
-- 3. plan_features — which features each plan includes
-- ═════════════════════════════════════════════════════════════════════
create table public.plan_features (
  plan_id     uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null references public.subscription_features(key) on delete cascade,
  primary key (plan_id, feature_key)
);
alter table public.plan_features enable row level security;
create policy plan_features_read_all on public.plan_features
  for select to anon, authenticated using (true);

-- Starter: essential bookkeeping. Growth: full double-entry + team.
-- Premium: everything (inventory, advanced tax, depreciation, compliance).
with grants(plan_code, feature_key) as (values
  -- Starter
  ('starter','sales'), ('starter','purchasing'), ('starter','banking'), ('starter','vat'),
  ('starter','financial_statements'), ('starter','assets'),
  -- Growth = Starter + ...
  ('growth','sales'), ('growth','purchasing'), ('growth','banking'), ('growth','vat'),
  ('growth','financial_statements'), ('growth','assets'),
  ('growth','sales_receipts'), ('growth','purchasing_payments'), ('growth','income_tax'),
  ('growth','general_ledger'), ('growth','audit_trail'),
  -- Premium = Growth + ...
  ('premium','sales'), ('premium','purchasing'), ('premium','banking'), ('premium','vat'),
  ('premium','financial_statements'), ('premium','assets'),
  ('premium','sales_receipts'), ('premium','purchasing_payments'), ('premium','income_tax'),
  ('premium','general_ledger'), ('premium','audit_trail'),
  ('premium','advanced_tax'), ('premium','assets_depreciation'), ('premium','inventory'),
  ('premium','compliance')
)
insert into public.plan_features (plan_id, feature_key)
select p.id, g.feature_key
from grants g
join public.subscription_plans p on p.code = g.plan_code;


-- ═════════════════════════════════════════════════════════════════════
-- 4. Subscriptions + audit
-- ═════════════════════════════════════════════════════════════════════
create type public.subscription_status as enum
  ('pending', 'trialing', 'active', 'past_due', 'suspended', 'cancelled', 'expired');

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null unique references public.companies(id) on delete cascade,
  plan_id              uuid not null references public.subscription_plans(id),
  status               public.subscription_status not null default 'pending',
  provider             text,                    -- 'paystack' once connected; null while unmanaged
  provider_reference   text,                    -- Paystack subscription/customer code
  current_period_start date,
  current_period_end   date,
  activated_at         timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.subscriptions is 'One row per company once its Vertex subscription is created/activated (by the Paystack webhook Edge Function or a superuser). A company with NO row is "unmanaged" = fully entitled (grandfathered).';

create index subscriptions_plan_id_idx on public.subscriptions (plan_id);
create index subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;
create policy subscriptions_read_own on public.subscriptions
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) or public.get_my_role() = 'superuser');
-- No client insert/update/delete: managed by the Edge Function (service_role,
-- bypasses RLS) or a superuser via direct/administrative tooling.
create policy subscriptions_write_superuser on public.subscriptions
  for all to authenticated
  using (public.get_my_role() = 'superuser')
  with check (public.get_my_role() = 'superuser');

create table public.subscription_events (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  company_id      uuid not null references public.companies(id) on delete cascade,
  event_type      text not null,               -- created | activated | plan_changed | past_due | suspended | reactivated | cancelled | expired
  detail          jsonb,
  created_at      timestamptz not null default now()
);
create index subscription_events_company_id_idx on public.subscription_events (company_id);
create index subscription_events_subscription_id_idx on public.subscription_events (subscription_id);

alter table public.subscription_events enable row level security;
create policy subscription_events_read_own on public.subscription_events
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) or public.get_my_role() = 'superuser');
create policy subscription_events_write_superuser on public.subscription_events
  for all to authenticated
  using (public.get_my_role() = 'superuser')
  with check (public.get_my_role() = 'superuser');


-- ═════════════════════════════════════════════════════════════════════
-- 5. The authoritative resolver
-- ═════════════════════════════════════════════════════════════════════
-- Effective entitlements for the CALLER's company:
--   * every core feature, always;
--   * if the company has NO subscription row  -> every feature (unmanaged);
--   * else the active plan's features, but only while status in
--     ('active','trialing') — a past_due / suspended / cancelled / expired
--     subscription drops to core-only (that is LAYER 1, "active subscription").
create or replace function public.company_entitlements() returns setof text
language sql stable security definer set search_path to 'public'
as $$
  with co as (select public.get_my_company_id() as id),
       sub as (select * from public.subscriptions s, co where s.company_id = co.id)
  select f.key from public.subscription_features f where f.is_core
  union
  select f.key from public.subscription_features f
    where not exists (select 1 from sub)
  union
  select pf.feature_key
    from sub
    join public.plan_features pf on pf.plan_id = sub.plan_id
    where sub.status in ('active', 'trialing');
$$;

create or replace function public.company_has_entitlement(p_key text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select p_key = any (array(select public.company_entitlements()));
$$;

create or replace function public.require_entitlement(p_key text) returns void
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not public.company_has_entitlement(p_key) then
    raise exception 'Your Vertex plan does not include this feature (%). Upgrade to continue.', p_key
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.company_entitlements() from public, anon;
revoke all on function public.company_has_entitlement(text) from public, anon;
revoke all on function public.require_entitlement(text) from public, anon;
grant execute on function public.company_entitlements() to authenticated;
grant execute on function public.company_has_entitlement(text) to authenticated;
grant execute on function public.require_entitlement(text) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- 6. Server-side enforcement SCAFFOLD — inventory (the clearest Premium-only
--    module). BEFORE INSERT triggers on the inventory-write tables call the
--    same resolver the frontend uses. Additive; no engine function touched.
--    For an unmanaged company this is a no-op. Other modules adopt the same
--    `require_entitlement(...)` pattern incrementally — see docs/PLAN_ENTITLEMENTS.md.
-- ═════════════════════════════════════════════════════════════════════
create or replace function public.enforce_inventory_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- migration / seed / service_role context: no session, nothing to check.
  if (select auth.uid()) is null then
    return new;
  end if;
  perform public.require_entitlement('inventory');
  return new;
end;
$$;

revoke all on function public.enforce_inventory_entitlement() from public, anon, authenticated;

drop trigger if exists products_entitlement on public.products;
create trigger products_entitlement before insert on public.products
  for each row execute function public.enforce_inventory_entitlement();

drop trigger if exists warehouses_entitlement on public.warehouses;
create trigger warehouses_entitlement before insert on public.warehouses
  for each row execute function public.enforce_inventory_entitlement();

drop trigger if exists stock_movements_entitlement on public.stock_movements;
create trigger stock_movements_entitlement before insert on public.stock_movements
  for each row execute function public.enforce_inventory_entitlement();


-- ═════════════════════════════════════════════════════════════════════
-- 7. Observability
-- ═════════════════════════════════════════════════════════════════════
do $$
declare v_feat int; v_plan int; v_pf int;
begin
  select count(*) into v_feat from public.subscription_features;
  select count(*) into v_plan from public.subscription_plans;
  select count(*) into v_pf   from public.plan_features;
  if v_feat <> 22 then raise exception '0068: expected 22 subscription_features, got %', v_feat; end if;
  if v_plan <> 3  then raise exception '0068: expected 3 plans, got %', v_plan; end if;
  if v_pf   <> 32 then raise exception '0068: expected 32 plan_features, got %', v_pf; end if;
  -- every plan_features.feature_key is a real, non-core feature
  if exists (select 1 from public.plan_features pf join public.subscription_features f on f.key = pf.feature_key where f.is_core) then
    raise exception '0068: a core feature was granted to a plan (core features are implicit)';
  end if;
  raise notice '0068: OK — % features, % plans, % plan-grants, resolver + inventory scaffold in place.', v_feat, v_plan, v_pf;
end $$;
