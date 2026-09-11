-- 0080_vat_source_entries
-- Fixed Assets accounting-integrity Review 3 (docs/FIXED_ASSETS.md, Open Item 2).
-- AUTHORED, NOT APPLIED.
--
-- Generic persisted VAT source/evidence for taxable transactions that
-- originate OUTSIDE the Invoice / Credit Note / Supplier Invoice pipeline —
-- starting with taxable fixed-asset disposals, whose output VAT the VAT
-- return could not previously see (it is derived from documents, and a
-- disposal posts only a GL journal). Deliberately NOT a
-- fixed-asset-disposal-only table: `source_type` / `source_id` keep it
-- open to any future non-document VAT event.
--
-- SCHEMA DECISIONS
--   * The VAT reporting engine (`vatReportService.computeVatReport` /
--     `listVatTransactions`) reads these rows alongside its existing
--     document sources — one report calculator, not two. `treatment` is the
--     branch the report classifies on (mirrors `tax_rates.treatment`);
--     `classification` is a coarser reporting tag (e.g. 'capital_goods').
--   * `tax_rate_id` is the AUTHORITATIVE rate reference — resolved from the
--     effective-dated `tax_rates` engine on the transaction date, never a
--     free-typed percentage. Composite FK to `tax_rates(company_id, id)`
--     (the 0028/0037 candidate key), so a cross-company rate is impossible.
--   * Append-only, same as depreciation_entries / asset_disposals: SELECT +
--     INSERT only. A reversal / correction is a NEW contra row (negative
--     amounts) pointing at the original via `reverses_entry_id` — accounting
--     evidence is never destructively deleted.
--   * Amounts: `taxable_amount` = net / ex-VAT consideration, `vat_amount` =
--     the VAT, `gross_amount` = taxable + VAT. `direction` is output/input.

create type public.vat_source_direction as enum ('output', 'input');

create table public.vat_source_entries (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  source_type          text not null,
  source_id            uuid not null,
  transaction_date     timestamptz not null,
  tax_rate_id          uuid not null,
  treatment            public.vat_treatment not null,
  direction            public.vat_source_direction not null,
  taxable_amount       numeric(14, 2) not null,
  vat_amount           numeric(14, 2) not null,
  gross_amount         numeric(14, 2) not null,
  classification       text,
  journal_entry_id     uuid references public.journal_entries(id),
  reverses_entry_id    uuid references public.vat_source_entries(id),
  reason               text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (company_id, tax_rate_id) references public.tax_rates(company_id, id)
);

create index vat_source_entries_company_id_idx on public.vat_source_entries (company_id);
create index vat_source_entries_source_idx on public.vat_source_entries (company_id, source_type, source_id);
create index vat_source_entries_transaction_date_idx on public.vat_source_entries (company_id, transaction_date);

alter table public.vat_source_entries enable row level security;

create policy vat_source_entries_select_own_company
  on public.vat_source_entries for select to authenticated
  using (company_id = (select public.get_my_company_id()));
create policy vat_source_entries_insert_own_company
  on public.vat_source_entries for insert to authenticated
  with check (company_id = (select public.get_my_company_id()));

revoke update, delete, truncate on public.vat_source_entries from anon, authenticated;
revoke all on public.vat_source_entries from anon;
