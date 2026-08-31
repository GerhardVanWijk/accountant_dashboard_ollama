-- 0021_inventory_stock_movement_types
-- Inventory Accounting Module — Phase 2. AUTHORED, NOT YET APPLIED (Review 2 gate).
--
-- Adds the granular stock-movement types the new module needs for full
-- traceability (docs/INVENTORY_ARCHITECTURE.md §13.2). `ALTER TYPE ... ADD VALUE`
-- is kept in its own migration so no later migration in the same transaction
-- has to reference a value added here (Postgres restriction).
--
-- Existing values (migration 0006): goods_received, sale, sales_return,
-- transfer_in, transfer_out, adjustment, opening.

alter type public.stock_movement_type add value if not exists 'purchase_return';
alter type public.stock_movement_type add value if not exists 'write_off';
alter type public.stock_movement_type add value if not exists 'stock_gain';
alter type public.stock_movement_type add value if not exists 'stock_take';
alter type public.stock_movement_type add value if not exists 'correction';
