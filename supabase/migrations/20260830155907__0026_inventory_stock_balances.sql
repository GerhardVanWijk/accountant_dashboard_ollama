-- 0026_inventory_stock_balances
-- Inventory Accounting Module — Phase 2. AUTHORED, NOT YET APPLIED (Review 2 gate).
--
-- Per-(product, warehouse) balance cache (fork D, user-approved). The
-- stock_movements ledger stays the SOURCE OF TRUTH; this table is a maintained
-- cache the read path can query without summing the whole ledger in JS, and is
-- reconciled to the ledger by an invariant test.
--
-- products.quantity_on_hand stays as a second, company-wide-scalar cache
-- (= sum of this table's quantity_on_hand for the product).

create table public.stock_balances (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  product_id         uuid not null references public.products(id) on delete cascade,
  warehouse_id       uuid not null references public.warehouses(id) on delete cascade,
  quantity_on_hand   numeric(14,3) not null default 0,
  quantity_committed numeric(14,3) not null default 0,
  quantity_on_order  numeric(14,3) not null default 0,
  updated_at         timestamptz not null default now(),
  unique (product_id, warehouse_id)
);

create index stock_balances_company_id_idx   on public.stock_balances (company_id);
create index stock_balances_product_id_idx   on public.stock_balances (product_id);
create index stock_balances_warehouse_id_idx on public.stock_balances (warehouse_id);

alter table public.stock_balances enable row level security;

create policy stock_balances_all_own_company on public.stock_balances
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- Backfill quantity_on_hand from the movement ledger. quantity_committed /
-- quantity_on_order stay 0 until Sales Order reservations / open PO quantities are
-- wired (a later phase; today's stockService already stubs them to 0).
insert into public.stock_balances (company_id, product_id, warehouse_id, quantity_on_hand)
select company_id, product_id, warehouse_id, sum(quantity_delta)
from public.stock_movements
group by company_id, product_id, warehouse_id
on conflict (product_id, warehouse_id) do nothing;
