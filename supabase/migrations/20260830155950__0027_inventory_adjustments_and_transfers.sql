-- 0027_inventory_adjustments_and_transfers
-- Inventory Accounting Module — Phase 2 (Review 2C Hybrid). AUTHORED, NOT YET APPLIED.
--
-- Stock Adjustment and Stock Transfer documents, each a normalized header + line
-- pair (a real child line table, never embedded JSON). Lifecycle is enforced by the service layer
-- (draft-only edit/delete; posted is immutable) — consistent with how every
-- other document in this app (invoices, bills, purchase orders) is guarded.
-- RLS is the coarse company-tenant model used everywhere else; a separate
-- application-wide role-aware DB authorization phase is tracked in
-- docs/CURRENT_TASKS.md.
--
-- Composite (company_id, id) candidate keys + composite FKs make it structurally
-- impossible for a Company-A line to reference a Company-B product / warehouse /
-- journal entry. Only candidate keys actually consumed by a composite FK below
-- are added.

alter table public.warehouses add column notes text;

create type public.stock_adjustment_status as enum ('draft', 'pending_approval', 'posted', 'cancelled');
create type public.stock_adjustment_reason as enum ('write_off', 'shrinkage', 'damage', 'stock_gain', 'correction', 'other');
create type public.stock_transfer_status as enum ('draft', 'in_transit', 'completed', 'cancelled');

-- Tenant-consistent candidate keys (id is already the PK, so this is unique by
-- construction — it exists solely as the target of the composite FKs below).
alter table public.products         add constraint products_company_id_id_key         unique (company_id, id);
alter table public.warehouses       add constraint warehouses_company_id_id_key       unique (company_id, id);
alter table public.journal_entries  add constraint journal_entries_company_id_id_key  unique (company_id, id);

-- ── Stock adjustments ────────────────────────────────────────────────────────
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  adjustment_number text not null,
  warehouse_id uuid not null,
  adjustment_date date not null,
  reason public.stock_adjustment_reason not null,
  notes text,
  total_cost_effect numeric(14,2) not null default 0,
  status public.stock_adjustment_status not null default 'draft',
  approved_by text,
  approved_at timestamptz,
  posted_by text,
  posted_at timestamptz,
  journal_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, adjustment_number),
  unique (company_id, id),
  foreign key (company_id, warehouse_id)     references public.warehouses(company_id, id),
  foreign key (company_id, journal_entry_id) references public.journal_entries(company_id, id)
);

create index stock_adjustments_company_id_idx       on public.stock_adjustments(company_id);
create index stock_adjustments_warehouse_id_idx     on public.stock_adjustments(warehouse_id);
create index stock_adjustments_journal_entry_id_idx on public.stock_adjustments(journal_entry_id);

create table public.stock_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_adjustment_id uuid not null,
  line_number integer not null,
  product_id uuid not null,
  warehouse_id uuid not null,
  quantity_delta numeric(14,3) not null,
  unit_cost numeric(14,4) not null,
  cost_effect numeric(14,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stock_adjustment_id, line_number),
  unique (stock_adjustment_id, product_id, warehouse_id),
  check (line_number > 0),
  check (quantity_delta <> 0),
  check (unit_cost >= 0),
  foreign key (company_id, stock_adjustment_id)
    references public.stock_adjustments(company_id, id) on delete cascade,
  foreign key (company_id, product_id)   references public.products(company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id)
);

create index stock_adjustment_lines_company_id_idx   on public.stock_adjustment_lines(company_id);
create index stock_adjustment_lines_product_id_idx   on public.stock_adjustment_lines(product_id);
create index stock_adjustment_lines_warehouse_id_idx on public.stock_adjustment_lines(warehouse_id);

-- ── Stock transfers ──────────────────────────────────────────────────────────
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_number text not null,
  from_warehouse_id uuid not null,
  to_warehouse_id uuid not null,
  transfer_date date not null,
  expected_receipt_date date,
  received_date date,
  notes text,
  total_cost numeric(14,2) not null default 0,
  status public.stock_transfer_status not null default 'draft',
  dispatched_journal_entry_id uuid,
  received_journal_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, transfer_number),
  unique (company_id, id),
  check (from_warehouse_id <> to_warehouse_id),
  check (expected_receipt_date is null or expected_receipt_date >= transfer_date),
  check (received_date is null or received_date >= transfer_date),
  foreign key (company_id, from_warehouse_id)           references public.warehouses(company_id, id),
  foreign key (company_id, to_warehouse_id)             references public.warehouses(company_id, id),
  foreign key (company_id, dispatched_journal_entry_id) references public.journal_entries(company_id, id),
  foreign key (company_id, received_journal_entry_id)   references public.journal_entries(company_id, id)
);

create index stock_transfers_company_id_idx                  on public.stock_transfers(company_id);
create index stock_transfers_from_warehouse_id_idx           on public.stock_transfers(from_warehouse_id);
create index stock_transfers_to_warehouse_id_idx             on public.stock_transfers(to_warehouse_id);
create index stock_transfers_dispatched_journal_entry_id_idx on public.stock_transfers(dispatched_journal_entry_id);
create index stock_transfers_received_journal_entry_id_idx   on public.stock_transfers(received_journal_entry_id);

create table public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_transfer_id uuid not null,
  line_number integer not null,
  product_id uuid not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,4) not null,
  total_cost numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stock_transfer_id, line_number),
  unique (stock_transfer_id, product_id),
  check (line_number > 0),
  check (quantity > 0),
  check (unit_cost >= 0),
  foreign key (company_id, stock_transfer_id)
    references public.stock_transfers(company_id, id) on delete cascade,
  foreign key (company_id, product_id) references public.products(company_id, id)
);

create index stock_transfer_lines_company_id_idx on public.stock_transfer_lines(company_id);
create index stock_transfer_lines_product_id_idx on public.stock_transfer_lines(product_id);

-- ── RLS: coarse company-tenant, same shape as invoices/bills/purchase_orders ──
alter table public.stock_adjustments      enable row level security;
alter table public.stock_adjustment_lines enable row level security;
alter table public.stock_transfers        enable row level security;
alter table public.stock_transfer_lines   enable row level security;

create policy stock_adjustments_all_own_company on public.stock_adjustments
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create policy stock_adjustment_lines_all_own_company on public.stock_adjustment_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create policy stock_transfers_all_own_company on public.stock_transfers
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));

create policy stock_transfer_lines_all_own_company on public.stock_transfer_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
