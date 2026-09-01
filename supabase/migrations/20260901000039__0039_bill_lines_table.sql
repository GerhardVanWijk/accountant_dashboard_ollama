-- 0039_bill_lines_table
-- Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §3/§11/§17). AUTHORED, NOT YET
-- APPLIED (Review 9B-A gate). Same additive/transitional shape as 0038
-- (invoice_lines) — see that file's header comment for the full rationale;
-- not repeated here.
--
-- One extra column vs invoice_lines: `fixed_asset_details jsonb` — a bill
-- line only, per `DocumentLineItem.fixedAssetDetails`
-- (src/types/common.ts: "Mutually exclusive with `productId`" —
-- FixedAssetLineDetails is a small nested object, so it keeps the same
-- jsonb-passthrough treatment `CreditNoteAllocation`/`SupplierReturn`
-- line-level tax fields etc. already get elsewhere; not normalized further.

create table public.bill_lines (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  bill_id uuid not null,
  line_number integer not null,
  product_id uuid,
  warehouse_id uuid,
  description text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  tax_rate_id uuid,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  fixed_asset_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_id, line_number),
  unique (company_id, id),
  check (quantity > 0),
  check (unit_price >= 0 and tax_amount >= 0),
  check (fixed_asset_details is null or product_id is null),
  foreign key (company_id, bill_id) references public.bills(company_id, id) on delete cascade,
  foreign key (company_id, product_id)   references public.products(company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id),
  foreign key (company_id, tax_rate_id)  references public.tax_rates(company_id, id)
);

create index bill_lines_company_id_idx   on public.bill_lines(company_id);
create index bill_lines_bill_id_idx      on public.bill_lines(bill_id);
create index bill_lines_product_id_idx   on public.bill_lines(product_id);
create index bill_lines_warehouse_id_idx on public.bill_lines(warehouse_id);
create index bill_lines_tax_rate_id_idx  on public.bill_lines(tax_rate_id);

comment on column public.bill_lines.id is
  'Preserved exactly from DocumentLineItem.id — see invoice_lines.id (migration 0038) for why.';

alter table public.bill_lines enable row level security;

create policy bill_lines_all_own_company on public.bill_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
