-- 0025_inventory_product_columns
-- Inventory Accounting Module — Phase 2. AUTHORED, NOT YET APPLIED (Review 2 gate).
--
-- Extends products with the fields a real inventory item needs
-- (docs/INVENTORY_ARCHITECTURE.md §13.2), fixes the nullable-no-default
-- valuation_method, and formalises the cost_price precision that an unversioned
-- change had already widened to numeric(14,4).

alter table public.products
  add column sales_description    text,
  add column purchase_description text,
  add column preferred_supplier_id uuid references public.suppliers(id),
  add column supplier_item_code   text,
  add column reorder_quantity     numeric(14,3),
  add column preferred_stock_level numeric(14,3),
  -- Optional per-product account overrides. NULL -> fall back to the product's
  -- category, then to the generic AccountMappingKey. Never a literal in a service.
  add column sales_account_id      uuid references public.accounts(id),
  add column inventory_account_id  uuid references public.accounts(id),
  add column cogs_account_id       uuid references public.accounts(id),
  add column purchase_account_id   uuid references public.accounts(id);

create index products_preferred_supplier_id_idx on public.products (preferred_supplier_id);
create index products_sales_account_id_idx      on public.products (sales_account_id);
create index products_inventory_account_id_idx  on public.products (inventory_account_id);
create index products_cogs_account_id_idx       on public.products (cogs_account_id);
create index products_purchase_account_id_idx   on public.products (purchase_account_id);

-- valuation_method: was nullable with no default; the "NULL means weighted_average"
-- rule lived only in application code (fork A — WAC is the authoritative model).
update public.products set valuation_method = 'weighted_average' where valuation_method is null;
alter table public.products alter column valuation_method set default 'weighted_average';
alter table public.products alter column valuation_method set not null;

comment on column public.products.cost_price is
  'Weighted-average unit cost, numeric(14,4). Formalised here — the live column was widened from (14,2) by an unversioned change during Phase 21 P1.2 (inventory 4dp WAC re-restatement).';
