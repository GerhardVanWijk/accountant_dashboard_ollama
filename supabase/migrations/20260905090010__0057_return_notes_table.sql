-- 0057_return_notes_table
-- Phase 5D (Return Notes — the genuine remaining scope identified by the
-- 2026-09-05 completion audit: Credit Notes already fully cover returning
-- INVOICED goods; there was no mechanism for goods that were physically
-- DELIVERED but NOT YET invoiced. Lifecycle: SO -> DN -> Return Note (this
-- migration) covers that gap; SO -> DN -> Invoice -> Credit Note remains the
-- path once the goods have been billed.
--
-- New document table, following the `delivery_notes` (0052) precedent
-- exactly:
--   * `line_items jsonb` is the authoritative line store — same pattern as
--     every other document table. No normalized child table (same reasoning
--     as `delivery_notes` itself skipping one, 0052).
--   * NO subtotal/tax/total header columns — a Return Note posts no
--     revenue/VAT/AR reversal (there was never an invoice), only a pure
--     inventory reclassification computed by `post_return_note` (0058) at
--     the ORIGINAL delivery's FROZEN cost (never today's WAC).
--   * `delivery_note_id` / `sales_order_id` / `customer_id` / `warehouse_id`
--     are all COMPOSITE FKs — every one of `delivery_notes`, `sales_orders`,
--     `customers`, `warehouses` already carries a `(company_id, id)`
--     candidate key (0052/0050/pre-existing), so a cross-company reference
--     on any of these four relationships is STRUCTURALLY impossible from the
--     first migration, no separate hardening pass needed (unlike 5C-A,
--     which needed 0050 as a prerequisite).
--   * `warehouse_id` is stored (matches the established inventory-effecting-
--     table convention) but the posting RPC (0058) independently verifies it
--     equals the source Delivery Note's own `warehouse_id` — a return always
--     goes back into the SAME warehouse it left from, never a
--     separately-selectable one (closes the "wrong warehouse" class of
--     error structurally, not just by UI omission).
--   * `unique (company_id, id)` added for the same future-proofing reason as
--     0052/0037/0050/0027/0029.
--   * No DB-level trigger blocking edits to a `posted` row — same
--     already-established application-layer-only boundary every document
--     table in this codebase uses (`ACCOUNTING_RELEVANT_FIELDS` guard in the
--     TypeScript service, here `ReturnNoteService.updateDraft()`).

create type public.return_note_status as enum ('draft', 'posted', 'cancelled');

create table public.return_notes (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  return_note_number  text not null,
  delivery_note_id    uuid not null,
  sales_order_id      uuid not null,
  customer_id         uuid not null,
  warehouse_id        uuid not null,
  return_date         timestamptz not null,
  status              public.return_note_status not null default 'draft',
  line_items          jsonb not null default '[]'::jsonb,
  notes               text,
  journal_entry_id    uuid references public.journal_entries(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, return_note_number),
  unique (company_id, id),
  foreign key (company_id, delivery_note_id) references public.delivery_notes(company_id, id),
  foreign key (company_id, sales_order_id)   references public.sales_orders(company_id, id),
  foreign key (company_id, customer_id)      references public.customers(company_id, id),
  foreign key (company_id, warehouse_id)     references public.warehouses(company_id, id)
);

create index return_notes_company_id_idx      on public.return_notes (company_id);
create index return_notes_delivery_note_id_idx on public.return_notes (delivery_note_id);
create index return_notes_sales_order_id_idx  on public.return_notes (sales_order_id);
create index return_notes_customer_id_idx     on public.return_notes (customer_id);
create index return_notes_warehouse_id_idx    on public.return_notes (warehouse_id);
create index return_notes_status_idx          on public.return_notes (status);

alter table public.return_notes enable row level security;

create policy return_notes_all_own_company on public.return_notes
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
