-- 0028_inventory_stock_takes
-- Inventory Accounting Module — Phase 2 (Review 2C Hybrid). AUTHORED, NOT YET APPLIED.
--
-- Physical count documents: normalized header + line pair (a real child line
-- table, never embedded JSON).
-- Lifecycle draft → counting → ready_for_review → posted (or cancelled) is
-- enforced by the service layer. `frozen_at` marks when expected quantities were
-- snapshotted. `expected_qty` / `unit_cost` are frozen line data; variance is
-- derived by the service (one authoritative calculation contract — no duplicate
-- formula CHECK in SQL). RLS is the coarse company-tenant model.

create type public.stock_take_status as enum
  ('draft', 'counting', 'ready_for_review', 'posted', 'cancelled');

create table public.stock_takes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_take_number text not null,
  warehouse_id uuid not null,
  scope text not null default 'all',
  scope_ref jsonb not null default '{}'::jsonb,
  count_date date not null,
  frozen_at timestamptz,
  total_variance_value numeric(14,2) not null default 0,
  status public.stock_take_status not null default 'draft',
  notes text,
  approved_by text,
  approved_at timestamptz,
  posted_by text,
  posted_at timestamptz,
  journal_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, stock_take_number),
  unique (company_id, id),
  check (scope in ('all', 'category', 'items')),
  foreign key (company_id, warehouse_id)     references public.warehouses(company_id, id),
  foreign key (company_id, journal_entry_id) references public.journal_entries(company_id, id)
);

create index stock_takes_company_id_idx       on public.stock_takes(company_id);
create index stock_takes_warehouse_id_idx     on public.stock_takes(warehouse_id);
create index stock_takes_journal_entry_id_idx on public.stock_takes(journal_entry_id);

create table public.stock_take_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_take_id uuid not null,
  line_number integer not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  expected_qty numeric(14,3) not null,
  counted_qty numeric(14,3),
  unit_cost numeric(14,4) not null,
  variance_qty numeric(14,3) not null default 0,
  variance_value numeric(14,2) not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stock_take_id, line_number),
  unique (stock_take_id, product_id, warehouse_id),
  check (line_number > 0),
  -- `expected_qty` may be negative if the source ledger already holds a
  -- negative-stock condition; a physical count itself cannot be negative.
  check (counted_qty is null or counted_qty >= 0),
  check (unit_cost >= 0),
  foreign key (company_id, stock_take_id)
    references public.stock_takes(company_id, id) on delete cascade,
  foreign key (company_id, product_id)   references public.products(company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id)
);

create index stock_take_lines_company_id_idx   on public.stock_take_lines(company_id);
create index stock_take_lines_product_id_idx   on public.stock_take_lines(product_id);
create index stock_take_lines_warehouse_id_idx on public.stock_take_lines(warehouse_id);

alter table public.stock_takes      enable row level security;
alter table public.stock_take_lines enable row level security;

create policy stock_takes_all_own_company on public.stock_takes
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create policy stock_take_lines_all_own_company on public.stock_take_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
