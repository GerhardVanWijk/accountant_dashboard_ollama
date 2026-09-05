-- 0059_account_reference_company_safety
-- Whole-project completion audit, Part 8 (docs/CURRENT_TASKS.md § "KNOWN
-- ISSUES" — the `post_inventory_transaction` account-FK hardening gap).
--
-- EXACT SCHEMA INVENTORY (re-derived live, 2026-09-05, superseding the
-- earlier "~7 tables / ~18 columns" estimate with the real one): every
-- PLAIN (single-column) foreign key anywhere in the schema pointing at
-- `accounts(id)` — 18 columns across 8 tables. (`opening_stock_batches` is
-- excluded — it already carries the composite `(company_id, offset_account_id)
-- references accounts(company_id, id)` pattern from an earlier migration.)
--
--   accounts.parent_account_id                          (self-referential)
--   bank_accounts.gl_account_id
--   category_account_mappings.cogs_account_id
--   category_account_mappings.inventory_account_id
--   category_account_mappings.revenue_account_id
--   fixed_assets.gl_accumulated_depreciation_account_id
--   fixed_assets.gl_asset_account_id
--   fixed_assets.gl_depreciation_expense_account_id
--   journal_lines.account_id
--   payroll_runs.contra_account_id
--   product_categories.adjustment_account_id
--   product_categories.cogs_account_id
--   product_categories.inventory_account_id
--   product_categories.revenue_account_id
--   products.cogs_account_id
--   products.inventory_account_id
--   products.purchase_account_id
--   products.sales_account_id
--
-- LIVE PREFLIGHT (read-only, 2026-09-05, against bcaffvpibpitpuqglszn):
--   * `accounts` already carries `unique (company_id, id)` (`accounts_company_id_id_key`)
--     — the prerequisite candidate key every composite FK below needs. No
--     prerequisite migration required (unlike Phase 5C-A's 0050).
--   * Every one of the 8 source tables already has its own `company_id`
--     column.
--   * Zero cross-company violations exist today for any of the 18 columns
--     above (each verified individually: `t.company_id <> a.company_id`
--     returns 0 rows) — confirmed live immediately before authoring this
--     migration.
--
-- WHAT THIS MIGRATION DOES: adds ONE additional COMPOSITE foreign key per
-- column above — `foreign key (company_id, <col>) references
-- accounts(company_id, id)` — alongside the EXISTING plain FK (left
-- untouched; a composite FK is strictly stronger, so the plain one becomes
-- redundant but is harmless to leave in place — dropping it is optional
-- cleanup, not a safety requirement, and this migration stays purely
-- ADDITIVE per the CP discipline this codebase already holds every other
-- schema-safety migration to). No business row is modified. No existing
-- constraint is dropped or altered. No journal entry, product, category, or
-- account row is rewritten.
--
-- EFFECT: a cross-company account reference on any of these 18 columns
-- becomes STRUCTURALLY IMPOSSIBLE, not merely improbable under RLS — the
-- exact same guarantee already achieved for `delivery_notes`/`return_notes`/
-- `invoice_lines`/`bill_lines`/`purchase_order_lines`/`credit_note_lines`/
-- `sales_orders`/`customers`/`warehouses`.

alter table public.accounts
  add constraint accounts_parent_account_company_fk
  foreign key (company_id, parent_account_id) references public.accounts (company_id, id);

alter table public.bank_accounts
  add constraint bank_accounts_gl_account_company_fk
  foreign key (company_id, gl_account_id) references public.accounts (company_id, id);

alter table public.category_account_mappings
  add constraint cam_cogs_account_company_fk
  foreign key (company_id, cogs_account_id) references public.accounts (company_id, id),
  add constraint cam_inventory_account_company_fk
  foreign key (company_id, inventory_account_id) references public.accounts (company_id, id),
  add constraint cam_revenue_account_company_fk
  foreign key (company_id, revenue_account_id) references public.accounts (company_id, id);

alter table public.fixed_assets
  add constraint fixed_assets_accum_dep_account_company_fk
  foreign key (company_id, gl_accumulated_depreciation_account_id) references public.accounts (company_id, id),
  add constraint fixed_assets_asset_account_company_fk
  foreign key (company_id, gl_asset_account_id) references public.accounts (company_id, id),
  add constraint fixed_assets_dep_expense_account_company_fk
  foreign key (company_id, gl_depreciation_expense_account_id) references public.accounts (company_id, id);

alter table public.journal_lines
  add constraint journal_lines_account_company_fk
  foreign key (company_id, account_id) references public.accounts (company_id, id);

alter table public.payroll_runs
  add constraint payroll_runs_contra_account_company_fk
  foreign key (company_id, contra_account_id) references public.accounts (company_id, id);

alter table public.product_categories
  add constraint product_categories_adjustment_account_company_fk
  foreign key (company_id, adjustment_account_id) references public.accounts (company_id, id),
  add constraint product_categories_cogs_account_company_fk
  foreign key (company_id, cogs_account_id) references public.accounts (company_id, id),
  add constraint product_categories_inventory_account_company_fk
  foreign key (company_id, inventory_account_id) references public.accounts (company_id, id),
  add constraint product_categories_revenue_account_company_fk
  foreign key (company_id, revenue_account_id) references public.accounts (company_id, id);

alter table public.products
  add constraint products_cogs_account_company_fk
  foreign key (company_id, cogs_account_id) references public.accounts (company_id, id),
  add constraint products_inventory_account_company_fk
  foreign key (company_id, inventory_account_id) references public.accounts (company_id, id),
  add constraint products_purchase_account_company_fk
  foreign key (company_id, purchase_account_id) references public.accounts (company_id, id),
  add constraint products_sales_account_company_fk
  foreign key (company_id, sales_account_id) references public.accounts (company_id, id);
