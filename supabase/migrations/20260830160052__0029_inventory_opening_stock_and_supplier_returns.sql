-- 0029_inventory_opening_stock_and_supplier_returns
-- Inventory Accounting Module — Phase 2 (Review 2C Hybrid). AUTHORED, NOT YET APPLIED.
--
-- Opening Stock Batch: the deliberate, accounting-significant workflow for
-- capturing opening inventory. A draft batch can be populated (incl. by import);
-- confirming previews the effect (DR 1200 Inventory / CR offset_account_id,
-- default 3950 Opening Balance Equity) and requires explicit user confirmation
-- before it posts.
--
-- Supplier Return: the missing purchase-return path. Reverses inventory
-- capitalisation and input VAT on goods sent back to a supplier.
--
-- Both are normalized header + line pairs (real child line tables, never embedded
-- JSON). Lifecycle is service-enforced; RLS is the coarse company-tenant model.
-- Totals are computed
-- by the service (one authoritative calculation contract — no formula CHECK in
-- SQL); only structural bounds are constrained here.

create type public.opening_stock_batch_status as enum ('draft', 'confirmed', 'cancelled');
create type public.supplier_return_status     as enum ('draft', 'posted', 'cancelled');

-- Tenant-consistent candidate keys — each is the target of a composite FK below.
-- (stock_movements (company_id, id) was already added in migration 0022.)
alter table public.accounts         add constraint accounts_company_id_id_key         unique (company_id, id);
alter table public.suppliers        add constraint suppliers_company_id_id_key        unique (company_id, id);
alter table public.bills            add constraint bills_company_id_id_key            unique (company_id, id);
alter table public.purchase_orders  add constraint purchase_orders_company_id_id_key  unique (company_id, id);
alter table public.tax_rates        add constraint tax_rates_company_id_id_key        unique (company_id, id);

-- ── Opening stock batches ────────────────────────────────────────────────────
create table public.opening_stock_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_number text not null,
  effective_date date not null,
  warehouse_id uuid not null,
  total_cost numeric(14,2) not null default 0,
  offset_account_id uuid,
  status public.opening_stock_batch_status not null default 'draft',
  confirmed_by text,
  confirmed_at timestamptz,
  journal_entry_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, batch_number),
  unique (company_id, id),
  foreign key (company_id, warehouse_id)      references public.warehouses(company_id, id),
  foreign key (company_id, offset_account_id) references public.accounts(company_id, id),
  foreign key (company_id, journal_entry_id)  references public.journal_entries(company_id, id)
);

create index opening_stock_batches_company_id_idx        on public.opening_stock_batches(company_id);
create index opening_stock_batches_warehouse_id_idx      on public.opening_stock_batches(warehouse_id);
create index opening_stock_batches_offset_account_id_idx on public.opening_stock_batches(offset_account_id);
create index opening_stock_batches_journal_entry_id_idx  on public.opening_stock_batches(journal_entry_id);

create table public.opening_stock_batch_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opening_stock_batch_id uuid not null,
  line_number integer not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,4) not null,
  total_cost numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opening_stock_batch_id, line_number),
  unique (opening_stock_batch_id, product_id, warehouse_id),
  check (line_number > 0),
  check (quantity > 0),
  check (unit_cost >= 0),
  foreign key (company_id, opening_stock_batch_id)
    references public.opening_stock_batches(company_id, id) on delete cascade,
  foreign key (company_id, product_id)   references public.products(company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id)
);

create index opening_stock_batch_lines_company_id_idx   on public.opening_stock_batch_lines(company_id);
create index opening_stock_batch_lines_product_id_idx   on public.opening_stock_batch_lines(product_id);
create index opening_stock_batch_lines_warehouse_id_idx on public.opening_stock_batch_lines(warehouse_id);

-- ── Supplier returns ─────────────────────────────────────────────────────────
create table public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  return_number text not null,
  supplier_id uuid not null,
  bill_id uuid,
  purchase_order_id uuid,
  return_date date not null,
  reason text,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status public.supplier_return_status not null default 'draft',
  journal_entry_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, return_number),
  unique (company_id, id),
  check (subtotal >= 0 and tax_total >= 0 and total >= 0),
  foreign key (company_id, supplier_id)       references public.suppliers(company_id, id),
  foreign key (company_id, bill_id)           references public.bills(company_id, id),
  foreign key (company_id, purchase_order_id) references public.purchase_orders(company_id, id),
  foreign key (company_id, journal_entry_id)  references public.journal_entries(company_id, id)
);

create index supplier_returns_company_id_idx        on public.supplier_returns(company_id);
create index supplier_returns_supplier_id_idx       on public.supplier_returns(supplier_id);
create index supplier_returns_bill_id_idx           on public.supplier_returns(bill_id);
create index supplier_returns_purchase_order_id_idx on public.supplier_returns(purchase_order_id);
create index supplier_returns_journal_entry_id_idx  on public.supplier_returns(journal_entry_id);

create table public.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_return_id uuid not null,
  line_number integer not null,
  product_id uuid not null,
  warehouse_id uuid,
  description text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  tax_rate_id uuid,
  source_document_line_id uuid,
  source_stock_movement_id uuid,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_return_id, line_number),
  check (line_number > 0),
  check (quantity > 0),
  check (unit_price >= 0 and tax_amount >= 0 and line_total >= 0),
  foreign key (company_id, supplier_return_id)
    references public.supplier_returns(company_id, id) on delete cascade,
  foreign key (company_id, product_id)              references public.products(company_id, id),
  foreign key (company_id, warehouse_id)            references public.warehouses(company_id, id),
  foreign key (company_id, tax_rate_id)             references public.tax_rates(company_id, id),
  foreign key (company_id, source_stock_movement_id) references public.stock_movements(company_id, id)
);

create index supplier_return_lines_company_id_idx               on public.supplier_return_lines(company_id);
create index supplier_return_lines_product_id_idx               on public.supplier_return_lines(product_id);
create index supplier_return_lines_warehouse_id_idx             on public.supplier_return_lines(warehouse_id);
create index supplier_return_lines_tax_rate_id_idx              on public.supplier_return_lines(tax_rate_id);
create index supplier_return_lines_source_stock_movement_id_idx on public.supplier_return_lines(source_stock_movement_id);

comment on column public.supplier_return_lines.source_document_line_id is
  'Optional UUID copied from the originating bill / purchase-order JSON line. No FK is possible until those legacy document lines are normalized.';
comment on column public.supplier_return_lines.source_stock_movement_id is
  'Optional tenant-consistent FK to the goods-received stock movement being returned — the stronger receipt evidence where available.';

-- ── RLS: coarse company-tenant, same shape as invoices/bills/purchase_orders ──
alter table public.opening_stock_batches      enable row level security;
alter table public.opening_stock_batch_lines  enable row level security;
alter table public.supplier_returns           enable row level security;
alter table public.supplier_return_lines      enable row level security;

create policy opening_stock_batches_all_own_company on public.opening_stock_batches
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create policy opening_stock_batch_lines_all_own_company on public.opening_stock_batch_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create policy supplier_returns_all_own_company on public.supplier_returns
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create policy supplier_return_lines_all_own_company on public.supplier_return_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

-- Default the opening-stock offset account to 3950 for every existing company
-- (no rows exist yet; harmless no-op at apply time, correct for any pre-seeded row).
update public.opening_stock_batches b
  set offset_account_id = a.id
from public.accounts a
where a.company_id = b.company_id and a.code = '3950' and b.offset_account_id is null;
