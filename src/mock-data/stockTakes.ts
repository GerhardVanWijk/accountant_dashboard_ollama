import type { StockTake } from '@/types';

/**
 * Seed data for MockStockTakeRepository (migration 0028, Inventory
 * Accounting Phase 2). Intentionally empty — stock takes are created
 * through the counting workflow (draft → counting → ready_for_review →
 * posted), never hand-seeded, so no fixture can drift from the lifecycle
 * rules the service enforces. Phase 3 wires the GL / movement posting.
 */
export const seedStockTakes: StockTake[] = [];
