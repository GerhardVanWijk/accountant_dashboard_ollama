import type { StockTransfer } from '@/types';

/**
 * Seed data for MockStockTransferRepository
 * (src/features/inventory/repositories/).
 *
 * Intentionally empty. Inter-warehouse transfers post to the GL (via the
 * in-transit leg) and record stock movements once Phase 3 lands — their
 * demo/reference data is created in Phase 12 via SQL against a real company
 * + warehouses + products, not hand-rolled here where it would drift from
 * the migration 0027 schema. See docs/INVENTORY_ACCOUNTING.md.
 */
export const seedStockTransfers: StockTransfer[] = [];
