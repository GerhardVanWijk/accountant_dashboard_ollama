-- 0038_invoice_lines_table
-- Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §2/§11/§17). AUTHORED, NOT YET
-- APPLIED (Review 9B-A gate).
--
-- Normalizes `invoices.line_items` out of jsonb into a real, FK-enforced
-- child table — the same header+lines pattern `supplier_return_lines` /
-- `opening_stock_batch_lines` already use (migration 0029), applied here
-- for the first time to the four documents that were still jsonb-only
-- (invoice/bill/PO/credit-note).
--
-- ADDITIVE / TRANSITIONAL, per the Review 9B-A brief:
--   - `invoices.line_items` jsonb is NOT dropped, NOT altered, and stays
--     the field every existing reader (postInvoice, aging, dashboards)
--     continues to read from — see docs/PHASE_9B_DESIGN.md's authority
--     table. This table is a parallel, additive projection.
--   - `id` is preserved exactly from the jsonb line's own `.id` — both by
--     the deterministic backfill (0042) for EXISTING rows and by every
--     future write once the application-layer projector (Phase 9B code)
--     starts dual-writing — so `stock_movements.source_document_line_id`
--     keeps meaning the same thing whichever representation is queried.
--   - `discount` was requested in the Phase 9B brief's field list but does
--     NOT exist anywhere in `DocumentLineItem`/the jsonb source today
--     (verified: no `discount` field on the type, no such key appears in
--     the jsonb). Nothing to map or backfill — omitted here rather than
--     invented; add it as a real new field, with its own review, if it
--     becomes a real requirement.
--   - `product_id` is nullable — service/freight/discount/non-stock lines
--     are legitimate and must never be forced to point at a Product
--     (docs/ACCOUNTING_RELATIONSHIPS.md §13).

create table public.invoice_lines (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null,
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
  unique (invoice_id, line_number),
  unique (company_id, id),
  check (quantity > 0),
  check (unit_price >= 0 and tax_amount >= 0),
  foreign key (company_id, invoice_id) references public.invoices(company_id, id) on delete cascade,
  foreign key (company_id, product_id)   references public.products(company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses(company_id, id),
  foreign key (company_id, tax_rate_id)  references public.tax_rates(company_id, id)
);

create index invoice_lines_company_id_idx   on public.invoice_lines(company_id);
create index invoice_lines_invoice_id_idx   on public.invoice_lines(invoice_id);
create index invoice_lines_product_id_idx   on public.invoice_lines(product_id);
create index invoice_lines_warehouse_id_idx on public.invoice_lines(warehouse_id);
create index invoice_lines_tax_rate_id_idx  on public.invoice_lines(tax_rate_id);

comment on column public.invoice_lines.id is
  'Preserved exactly from DocumentLineItem.id (the jsonb line''s own id) — this is the identity stock_movements.source_document_line_id already points at, going back to before this table existed.';
comment on column public.invoice_lines.product_id is
  'Nullable — a service/freight/discount line legitimately has no product. See docs/ACCOUNTING_RELATIONSHIPS.md §13.';

alter table public.invoice_lines enable row level security;

create policy invoice_lines_all_own_company on public.invoice_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
