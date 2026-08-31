-- 0024_inventory_product_categories
-- Inventory Accounting Module — Phase 2. AUTHORED, NOT YET APPLIED (Review 2 gate).
--
-- Promotes the free-text products.category to a real per-company entity with its
-- own account mappings (fork B, user-approved). Migration path is a safe
-- dual-write: products.category (text) is KEPT and left populated; a new nullable
-- products.category_id is backfilled from it. The existing
-- category_account_mappings table (migration 0019, 5 rows, read by
-- CategoryAccountMappingService) is folded IN here and left in place — a later
-- migration deprecates it once the resolver reads product_categories (Phase 3).

create table public.product_categories (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  name                 text not null,
  description          text,
  revenue_account_id   uuid references public.accounts(id),
  cogs_account_id      uuid references public.accounts(id),
  inventory_account_id uuid references public.accounts(id),
  adjustment_account_id uuid references public.accounts(id),
  default_tax_rate_id  uuid references public.tax_rates(id),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, name)
);

create index product_categories_company_id_idx           on public.product_categories (company_id);
create index product_categories_revenue_account_id_idx    on public.product_categories (revenue_account_id);
create index product_categories_cogs_account_id_idx       on public.product_categories (cogs_account_id);
create index product_categories_inventory_account_id_idx  on public.product_categories (inventory_account_id);
create index product_categories_adjustment_account_id_idx on public.product_categories (adjustment_account_id);
create index product_categories_default_tax_rate_id_idx   on public.product_categories (default_tax_rate_id);

alter table public.product_categories enable row level security;

create policy product_categories_all_own_company on public.product_categories
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- Seed one row per distinct free-text category, folding in the account IDs from
-- category_account_mappings where a mapping row exists (5 of the 6 Office National
-- categories are mapped; "Delivery & Service" is not and stays account-less).
insert into public.product_categories
  (company_id, name, revenue_account_id, cogs_account_id, inventory_account_id)
select distinct
  p.company_id,
  p.category,
  m.revenue_account_id,
  m.cogs_account_id,
  m.inventory_account_id
from public.products p
left join public.category_account_mappings m
  on m.company_id = p.company_id and m.category_name = p.category
where p.category is not null and p.category <> ''
on conflict (company_id, name) do nothing;

-- Default adjustment_account_id to the company's 5050 Inventory Adjustments (0023).
update public.product_categories pc
  set adjustment_account_id = a.id
from public.accounts a
where a.company_id = pc.company_id
  and a.code = '5050'
  and pc.adjustment_account_id is null;

-- products.category_id: nullable FK, backfilled by name match. products.category
-- (text) is intentionally kept for the transition.
alter table public.products
  add column category_id uuid references public.product_categories(id);

create index products_category_id_idx on public.products (category_id);

update public.products p
  set category_id = pc.id
from public.product_categories pc
where pc.company_id = p.company_id
  and pc.name = p.category
  and p.category_id is null;
