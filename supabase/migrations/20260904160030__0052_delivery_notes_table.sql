-- 0052_delivery_notes_table
-- Phase 5C-A (docs/DELIVERY_NOTES_DESIGN.md Parts 2, 3, 9, 24). AUTHORED,
-- NOT APPLIED (hardened CP-5C-A gate). Renumbered from 0051 during the
-- CP-5C-A hardening pass; `sales_order_id`/`customer_id` UPGRADED from
-- plain to COMPOSITE FKs, now that 0050 has provided the prerequisite
-- `(company_id, id)` candidate keys on both target tables.
--
-- New document table for Delivery Notes — the physical-dispatch evidence a
-- Sales Order line accrues before (or without) invoicing. Status lifecycle
-- is `draft -> posted -> cancelled` (Part 3 — ONE physical-departure event,
-- no separate dispatched/delivered split, mirroring
-- `purchaseOrderService.recordReceipt()`'s `sent -> received`).
--
-- SCHEMA DECISIONS (justified in the design doc, repeated briefly here):
--   * `line_items jsonb` is the authoritative line store — same pattern as
--     every other document table (quotes/sales_orders/invoices/credit_notes/
--     purchase_orders). No `delivery_note_lines` normalized child table in
--     5C (Part 24 "OPTIONAL LATER" — `sales_orders` itself has no normalized
--     line table either).
--   * NO subtotal/tax_total/total header columns. A Delivery Note posts no
--     revenue and is not a sales document — its own GL effect (the clearing
--     amount) is computed by `post_delivery_note` (0054) at CURRENT WAC at
--     posting time, never stored as a price-based total on the header.
--     `unitPrice`/`taxAmount`/`lineTotal` DO live inside each line_items
--     element (copied from the SO line, for the printable document — see
--     Part 18, which explicitly excludes price from the DEFAULT print
--     template even though the data is stored).
--   * `sales_order_id` / `customer_id` are now COMPOSITE FKs to
--     `sales_orders(company_id, id)` / `customers(company_id, id)` — the
--     CP-5C-A hardening decision. Originally authored as plain FKs
--     (matching `sales_orders.customer_id`/`quote_id`'s own ORIGINAL,
--     pre-9B convention, migration 0006); upgraded because "we have
--     repeatedly chosen company-safe composite relationships elsewhere in
--     Vertex" and 0050 removes the only reason not to (neither table had a
--     `(company_id, id)` candidate key before 0050). This closes the exact
--     class of gap flagged in the original CP-5C-A `KNOWN_ISSUES.md` entry
--     — a cross-company `sales_order_id`/`customer_id` on a `delivery_notes`
--     row is now STRUCTURALLY impossible, not merely improbable under RLS.
--   * `warehouse_id` IS a composite FK to `warehouses(company_id, id)` —
--     this is the ESTABLISHED convention for every inventory-effecting
--     table (stock_adjustments, stock_transfers, stock_takes, invoice_lines,
--     bill_lines, purchase_order_lines, credit_note_lines all do this,
--     0027-0029/0038-0041), so it is followed here without exception —
--     unchanged from the original authoring.
--   * `unique (company_id, id)` is added on `delivery_notes` itself (the
--     0027/0029/0037/0050 candidate-key pattern) even though nothing needs
--     it yet — cheap now, and is exactly the prerequisite a future
--     normalized `delivery_note_lines` table (Part 24, OPTIONAL LATER) or
--     an `invoice_lines.delivery_note_line_id` composite FK would need
--     without a later retrofit migration.
--   * No DB-level trigger blocking edits to a `posted` row's `line_items`.
--     Every existing document table in this codebase (invoices, bills,
--     sales orders, credit notes) enforces "posted is immutable" at the
--     APPLICATION layer only (e.g. `updateInvoice`'s
--     `ACCOUNTING_RELEVANT_FIELDS` guard) — `delivery_notes` follows the
--     same, already-established boundary rather than introducing a new,
--     inconsistent DB-level mechanism only for this one table. The EXACT
--     field list a 5C-B "posted is immutable" application guard must cover
--     is specified in docs/DELIVERY_NOTES_DESIGN.md § "Posted Delivery Note
--     immutability contract" (CP-5C-A hardening).

create type public.delivery_note_status as enum ('draft', 'posted', 'cancelled');

create table public.delivery_notes (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  delivery_note_number  text not null,
  sales_order_id        uuid not null,
  customer_id           uuid not null,
  warehouse_id          uuid not null,
  delivery_date         timestamptz not null,
  status                public.delivery_note_status not null default 'draft',
  line_items            jsonb not null default '[]'::jsonb,
  notes                 text,
  journal_entry_id      uuid references public.journal_entries(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, delivery_note_number),
  unique (company_id, id),
  foreign key (company_id, sales_order_id) references public.sales_orders(company_id, id),
  foreign key (company_id, customer_id)    references public.customers(company_id, id),
  foreign key (company_id, warehouse_id)   references public.warehouses(company_id, id)
);

create index delivery_notes_company_id_idx     on public.delivery_notes (company_id);
create index delivery_notes_sales_order_id_idx on public.delivery_notes (sales_order_id);
create index delivery_notes_customer_id_idx    on public.delivery_notes (customer_id);
create index delivery_notes_warehouse_id_idx   on public.delivery_notes (warehouse_id);
create index delivery_notes_status_idx         on public.delivery_notes (status);

alter table public.delivery_notes enable row level security;

create policy delivery_notes_all_own_company on public.delivery_notes
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
