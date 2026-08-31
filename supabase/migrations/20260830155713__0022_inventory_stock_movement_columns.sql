-- 0022_inventory_stock_movement_columns
-- Inventory Accounting Module — Phase 2. AUTHORED, NOT YET APPLIED (Review 2 gate).
--
-- Puts cost and source-document traceability onto the append-only stock-movement
-- ledger (docs/INVENTORY_ARCHITECTURE.md §11, §13.2). Every future movement
-- carries its own historical unit cost -> weighted-average cost becomes
-- reconstructable from the ledger (kills the drift class that Phase 21 P1.2 had
-- to hand-restate) and COGS is auditable per movement.
--
-- All columns are ADDITIVE and nullable. The table stays append-only: RLS is
-- unchanged (SELECT + INSERT only; UPDATE/DELETE/TRUNCATE revoked in 0006).

alter table public.stock_movements
  add column unit_cost              numeric(14,4),
  add column total_cost             numeric(14,2),
  add column movement_date          date,
  add column source_document_type   text,
  add column source_document_id     uuid,
  add column source_document_line_id uuid,
  add column created_by             text,
  add column reversal_of_movement_id uuid;

-- Tenant-consistent candidate key (id is already the PK — unique by construction).
-- Consumed by the self-FK below AND by supplier_return_lines.source_stock_movement_id
-- in migration 0029. company_id is NOT NULL (verified live).
alter table public.stock_movements
  add constraint stock_movements_company_id_id_key unique (company_id, id);

-- A correction/reversal movement must reverse a movement in the SAME company —
-- a composite FK makes a cross-tenant reversal structurally impossible.
alter table public.stock_movements
  add constraint stock_movements_reversal_of_movement_id_fkey
  foreign key (company_id, reversal_of_movement_id)
  references public.stock_movements(company_id, id);

-- Backfill movement_date from the existing timestamp for the 284 pre-migration
-- rows. unit_cost / total_cost / source_document_* stay NULL for pre-migration
-- rows: the historical per-unit cost of each receipt/sale was never recorded, so
-- a best-effort reconstruction from linked bill/invoice line items is a SEPARATE
-- reviewed data migration, not this DDL. No posted journal entry is affected.
update public.stock_movements
  set movement_date = (created_at at time zone 'UTC')::date
  where movement_date is null;

alter table public.stock_movements
  alter column movement_date set default (now() at time zone 'UTC')::date;

comment on column public.stock_movements.unit_cost is
  'Weighted-average unit cost of the goods at the moment this movement was recorded (numeric(14,4)). Set by the inventory posting services going forward; NULL for movements created before migration 0022.';
comment on column public.stock_movements.source_document_type is
  'e.g. invoice / bill / credit_note / purchase_order / stock_adjustment / stock_transfer / stock_take / opening_stock_batch / supplier_return / reversal. Replaces the free-text reference for programmatic traceability.';
comment on column public.stock_movements.source_document_line_id is
  'UUID of the normalized source-document line. Deliberately polymorphic, so no single-table foreign key can represent it.';

create index stock_movements_product_id_warehouse_id_idx
  on public.stock_movements (product_id, warehouse_id);
create index stock_movements_product_id_movement_date_idx
  on public.stock_movements (product_id, movement_date);
create index stock_movements_source_document_idx
  on public.stock_movements (source_document_type, source_document_id);
create index stock_movements_reversal_of_movement_id_idx
  on public.stock_movements (reversal_of_movement_id);
