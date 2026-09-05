-- 0056_stock_movement_type_return_note
-- Phase 5D (Return Notes — docs/RETURN_NOTES_DESIGN.md). Adds the
-- `return_note` stock-movement type a posted Return Note's stock receipt is
-- tagged with. `ALTER TYPE ... ADD VALUE` cannot run inside a transaction and
-- cannot share one with any other DDL (the same restriction 0021/0048/0051
-- documented) — kept in its own migration for exactly that reason.
--
-- Existing values (0006 + 0021 + 0051): goods_received, sale, sales_return,
-- transfer_in, transfer_out, adjustment, opening, purchase_return,
-- write_off, stock_gain, stock_take, correction, delivery.
--
-- ADDITIVE ONLY, idempotent (`IF NOT EXISTS`, Postgres 12+). Inert until the
-- Return Note code that reads/writes it is deployed; every existing
-- `stock_movements` row keeps its current type. Read-only verified against
-- the live project (2026-09-05) that `'return_note'` is not already a value
-- of `stock_movement_type` — confirmed absent.

alter type public.stock_movement_type add value if not exists 'return_note';
