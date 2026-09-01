-- 0041_credit_note_lines_table
-- Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §4/§11/§17). AUTHORED, NOT YET
-- APPLIED (Review 9B-A gate). Same additive/transitional shape as 0038
-- (invoice_lines) — see that file's header comment; not repeated here.
--
-- `original_invoice_line_id` is the real fix for the Phase 9A-flagged gap:
-- application-layer validation (creditNoteService.issueCreditNote(), Phase
-- 9B code) already reads/writes this on the DTO via
-- `CreditNoteLineItem.originalInvoiceLineId` (src/types/creditNote.ts) —
-- this column is its durable, FK-enforced counterpart once normalized rows
-- exist. Nullable: a standalone/financial-only credit note line
-- legitimately has no original line to point at
-- (docs/ACCOUNTING_RELATIONSHIPS.md §4/§13).
--
-- Depends on 0038 (invoice_lines) for the FK target.

create table public.credit_note_lines (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  credit_note_id uuid not null,
  line_number integer not null,
  product_id uuid,
  warehouse_id uuid,
  description text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  tax_rate_id uuid,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  original_invoice_line_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_note_id, line_number),
  unique (company_id, id),
  check (quantity > 0),
  check (unit_price >= 0 and tax_amount >= 0),
  foreign key (company_id, credit_note_id) references public.credit_notes(company_id, id) on delete cascade,
  foreign key (company_id, product_id)     references public.products(company_id, id),
  foreign key (company_id, warehouse_id)   references public.warehouses(company_id, id),
  foreign key (company_id, tax_rate_id)    references public.tax_rates(company_id, id),
  foreign key (company_id, original_invoice_line_id) references public.invoice_lines(company_id, id)
);

create index credit_note_lines_company_id_idx     on public.credit_note_lines(company_id);
create index credit_note_lines_credit_note_id_idx on public.credit_note_lines(credit_note_id);
create index credit_note_lines_product_id_idx     on public.credit_note_lines(product_id);
create index credit_note_lines_warehouse_id_idx   on public.credit_note_lines(warehouse_id);
create index credit_note_lines_tax_rate_id_idx    on public.credit_note_lines(tax_rate_id);
create index credit_note_lines_original_invoice_line_id_idx on public.credit_note_lines(original_invoice_line_id);

comment on column public.credit_note_lines.id is
  'Preserved exactly from DocumentLineItem.id — see invoice_lines.id (migration 0038) for why.';
comment on column public.credit_note_lines.original_invoice_line_id is
  'The specific invoice_lines row this line credits. NULL for a standalone/financial-only credit note line with no physical return — see docs/ACCOUNTING_RELATIONSHIPS.md §4. Only backfillable for rows created after invoice_lines existed (migration 0038); a pre-existing credit note has no normalized invoice_lines row to point at, so its backfilled original_invoice_line_id stays NULL (0042) rather than guessed at.';

alter table public.credit_note_lines enable row level security;

create policy credit_note_lines_all_own_company on public.credit_note_lines
  for all to authenticated
  using (company_id = (select public.get_my_company_id()))
  with check (company_id = (select public.get_my_company_id()));
