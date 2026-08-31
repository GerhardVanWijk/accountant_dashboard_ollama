-- Backfilled from supabase_migrations.schema_migrations (already applied to the live project).
-- version: 20260828103349 · name: 0019_category_account_mappings


-- 0019_category_account_mappings
-- Per-company mapping from a product-category name to the revenue / cost-of-sales /
-- inventory accounts that category's sales and purchases should post to.
-- Joins on the existing free-text products.category value; zero changes to products.
-- New transactions entered through the app now post granular revenue/COGS lines
-- per category (matching the seeded historical data), falling back to the generic
-- SALES_REVENUE / COGS / INVENTORY accounts when a line has no product, no category,
-- or no mapping row.

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

-- (company_id, category_name) lookups are served by the UNIQUE constraint's index.
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
