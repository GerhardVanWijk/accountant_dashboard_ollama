import type { OpeningStockBatch } from '@/types';

/**
 * Seed data for MockOpeningStockBatchRepository (migration 0029, Inventory
 * Accounting Phase 2). Intentionally empty — an opening stock batch is the
 * only accounting-significant inventory import path and it is never
 * automatic, so there is no fixture to seed; batches are built in `draft`
 * and require explicit user confirmation to post (Phase 3).
 */
export const seedOpeningStockBatches: OpeningStockBatch[] = [];
