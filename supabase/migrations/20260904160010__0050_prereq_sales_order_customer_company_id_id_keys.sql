-- 0050_prereq_sales_order_customer_company_id_id_keys
-- Phase 5C-A HARDENING (docs/DELIVERY_NOTES_DESIGN.md § "CP-5C-A HARDENING").
-- AUTHORED, NOT APPLIED (hardened CP-5C-A gate).
--
-- Prerequisite for company-safe composite FKs from `delivery_notes` (0052)
-- to `sales_orders` and `customers` — the SAME pattern 0037 already used for
-- `invoices`/`credit_notes`, and 0027/0029 for `products`/`warehouses`/
-- `accounts`/`suppliers`/`bills`/`purchase_orders`/`tax_rates`. This
-- migration ONLY adds the two candidate keys; 0052 is what actually
-- upgrades `delivery_notes.sales_order_id`/`customer_id` to composite FKs.
--
-- SAFETY: `id` is already `uuid primary key` on both tables — globally
-- unique on its own. `unique (company_id, id)` can therefore NEVER conflict
-- with existing data; it is a strict, structurally-guaranteed-safe
-- superset-uniqueness of an already-unique column. There is no scenario
-- where two rows share `(company_id, id)` without also sharing `id`, which
-- the primary key already forbids. This was RE-VERIFIED read-only against
-- the live project (`bcaffvpibpitpuqglszn`, 2026-09-04) before authoring
-- this migration, not merely asserted from the schema alone:
--
--   sales_orders: 5 rows, 0 with company_id null, 5 distinct ids (= row count)
--   customers:   20 rows, 0 with company_id null, 20 distinct ids (= row count)
--   no pre-existing constraint named sales_orders_company_id_id_key / customers_company_id_id_key
--
-- Purely additive: a unique index on an existing (PK, FK-target) column
-- pair, nothing else touched. No business row modified. Matches 0037's own
-- precedent exactly (same reasoning, same shape, applied to two more
-- tables that needed it for the SAME reason — a new normalized
-- company-scoped child table referencing them).

alter table public.sales_orders
  add constraint sales_orders_company_id_id_key unique (company_id, id);

alter table public.customers
  add constraint customers_company_id_id_key unique (company_id, id);
