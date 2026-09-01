-- 0040_purchase_order_lines_table
-- Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §3/§11/§17). AUTHORED, NOT YET
-- APPLIED (Review 9B-A gate). Same additive/transitional shape as 0038
-- (invoice_lines) — see that file's header comment; not repeated here.
--
-- Enables the line-level evidence a Bill derived from a PO needs to keep:
-- `bill_lines.source_purchase_order_line_id` (see 0039... not added there —
-- deliberately deferred to a follow-up once the forward-write projector
-- exists and can prove which bill line actually came from which PO line;
-- authoring a FK to a relationship no current code populates would be
-- exactly the "manufactured relationship" the brief prohibits, so it is
-- listed here as NOT YET AUTHORED rather than guessed at).

create table public.purchase_order_lines (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_order_id uuid not null,
  line_number integer not null,
  product_id uuid,
  warehouse_id uuid,
  description text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  tax_rate_id uuid,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_order_id, line_number),
  unique (company_id, id),
  check (quantity > 0),
  check (unit_price >= 0 and tax_amount >= 0),
  foreign key (company_id, purchase_order_id) references public.purchase_orders(company_id, id) on delete cascade,
  foreign key (company_id, product_id)   references public.products(company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id),
  foreign key (company_id, tax_rate_id)  references public.tax_rates(company_id, id)
);

create index purchase_order_lines_company_id_idx   on public.purchase_order_lines(company_id);
create index purchase_order_lines_po_id_idx        on public.purchase_order_lines(purchase_order_id);
create index purchase_order_lines_product_id_idx   on public.purchase_order_lines(product_id);
create index purchase_order_lines_warehouse_id_idx on public.purchase_order_lines(warehouse_id);
create index purchase_order_lines_tax_rate_id_idx  on public.purchase_order_lines(tax_rate_id);

comment on column public.purchase_order_lines.id is
  'Preserved exactly from DocumentLineItem.id — see invoice_lines.id (migration 0038) for why.';

alter table public.purchase_order_lines enable row level security;

create policy purchase_order_lines_all_own_company on public.purchase_order_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
