import type { StockAdjustment } from '@/types';

/**
 * Seed data for MockStockAdjustmentRepository
 * (src/features/inventory/repositories/).
 *
 * Intentionally empty. Stock adjustments are accounting-significant
 * documents (they post to the GL and record stock movements once Phase 3
 * lands) — their demo/reference data is created in Phase 12 via SQL against
 * a real company + warehouses + products, not hand-rolled here where it
 * would drift from the migration 0027 schema. See docs/INVENTORY_ACCOUNTING.md.
 */
export const seedStockAdjustments: StockAdjustment[] = [];
