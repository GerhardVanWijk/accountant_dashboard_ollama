-- 0037_prereq_company_id_id_keys
-- Phase 9B (docs/ACCOUNTING_RELATIONSHIPS.md §11/§17). AUTHORED, NOT YET
-- APPLIED (Review 9B-A gate).
--
-- Prerequisite for the composite, company-safe FKs the normalized line
-- tables in 0038-0041 need. `bills`, `purchase_orders`, `suppliers`,
-- `products`, `warehouses`, `tax_rates` already carry a
-- `unique (company_id, id)` candidate key (migration 0029). `invoices` and
-- `credit_notes` do not — confirmed live via a read-only
-- `pg_constraint` query against the Office National project during the
-- 9B design pass (no other tables were missing this key).
--
-- Purely additive: a unique index on an existing (PK, FK) column pair,
-- nothing else touched.

alter table public.invoices
  add constraint invoices_company_id_id_key unique (company_id, id);

alter table public.credit_notes
  add constraint credit_notes_company_id_id_key unique (company_id, id);
