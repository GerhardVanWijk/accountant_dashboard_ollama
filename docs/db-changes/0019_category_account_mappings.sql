-- 0019_category_account_mappings
-- Per-company mapping from a product-category name to the revenue / cost-of-sales /
-- inventory accounts that category's sales and purchases should post to.
-- Joins on the existing free-text products.category value; zero changes to products.
-- New transactions entered through the app now post granular revenue/COGS lines
-- per category (matching the seeded historical data), falling back to the generic
-- SALES_REVENUE / COGS / INVENTORY accounts when a line has no product, no category,
-- or no mapping row.
--
-- Applied live to project bcaffvpibpitpuqglszn via the Supabase MCP apply_migration
-- on 2026-08-28 (Phase 21.3). This file mirrors the live DDL so the repo tree matches.

create table public.category_account_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_name text not null,
  revenue_account_id uuid references public.accounts(id),
  cogs_account_id uuid references public.accounts(id),
  inventory_account_id uuid references public.accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, category_name)
);

-- (company_id, category_name) lookups are served by the UNIQUE constraint's index;
-- the plain company_id index covers the RLS predicate + the service's "load all
-- mappings for my company" fetch. The three account-id indexes cover their foreign
-- keys (Supabase perf-linter 0001) — the fixed_assets table leaves the equivalent
-- gl_*_account_id FKs unindexed, but indexing them here keeps the new table clean.
create index category_account_mappings_company_id_idx
  on public.category_account_mappings (company_id);
create index category_account_mappings_revenue_account_id_idx
  on public.category_account_mappings (revenue_account_id);
create index category_account_mappings_cogs_account_id_idx
  on public.category_account_mappings (cogs_account_id);
create index category_account_mappings_inventory_account_id_idx
  on public.category_account_mappings (inventory_account_id);

alter table public.category_account_mappings enable row level security;

-- "Own company" ALL policy — same shape as public.fixed_assets' fixed_assets_all_own_company
-- (company resolved via public.profiles inside get_my_company_id()).
create policy category_account_mappings_all_own_company
  on public.category_account_mappings
  for all
  to authenticated
  using (company_id = ( select get_my_company_id() as get_my_company_id))
  with check (company_id = ( select get_my_company_id() as get_my_company_id));

-- Data: seed rows for Office National Demo (company 676c6cda-2e67-4ee3-8aaa-249b2c6bbc01).
-- Applied live via a separate execute_sql call in Phase 21.3; reproduced here so a
-- replay of this file lands the same rows. Guarded so it is a harmless no-op on any
-- database where that company / chart of accounts does not exist.
-- Delivery & Service products (type='service', non-tracked) are deliberately left
-- unmapped so they fall back to the generic SALES_REVENUE account.
insert into public.category_account_mappings
  (company_id, category_name, revenue_account_id, cogs_account_id, inventory_account_id)
select c.id, v.cat,
  (select id from public.accounts a where a.company_id = c.id and a.code = v.rev),
  (select id from public.accounts a where a.company_id = c.id and a.code = v.cogs),
  (select id from public.accounts a where a.company_id = c.id and a.code = v.inv)
from public.companies c
cross join (values
  ('Furniture',            '4010', '5010', '1200'),
  ('Printers & Equipment', '4020', '5020', '1200'),
  ('Stationery',           '4030', '5030', '1200'),
  ('Consumables',          '4040', '5040', '1200'),
  ('Peripherals',          '4020', '5020', '1200')
) as v(cat, rev, cogs, inv)
where c.id = '676c6cda-2e67-4ee3-8aaa-249b2c6bbc01'::uuid
on conflict (company_id, category_name) do nothing;
