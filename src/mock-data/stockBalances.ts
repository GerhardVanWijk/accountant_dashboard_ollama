import type { StockBalance } from '@/types';

/**
 * Seed data for MockStockBalanceRepository
 * (src/features/inventory/repositories/).
 *
 * Intentionally empty: `stock_balances` is a maintained per-(product,
 * warehouse) cache kept in step with the `stock_movements` ledger (the
 * source of truth) by the inventory services. There is nothing meaningful to
 * seed at design time — balances are produced by `applyDelta` /
 * `rebuildFromMovements` at runtime. The Mock repo starts from `[]`.
 */
export const seedStockBalances: StockBalance[] = [];
