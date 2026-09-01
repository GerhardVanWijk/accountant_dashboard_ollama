import type { StockMovement } from '@/types';

/** `${productId}::${warehouseId}` — the same composite key `reconcileInventory()` uses for its ledger/balance comparison. */
export function stockKey(productId: string, warehouseId: string): string {
  return `${productId}::${warehouseId}`;
}

/**
 * The most recent `StockMovement` per (product, warehouse), keyed by
 * `movementDate` (falling back to `createdAt` for the pre-Phase-2 movements
 * that predate that field — same fallback `StockMovementsPage` already
 * uses). Shared by the Out of Stock report ("Last movement where
 * available") and the Slow-Moving / Dead Stock report, so both apply the
 * exact same definition of "last movement" (spec §7/§16 both ask for it;
 * one implementation, not two that could quietly disagree).
 */
export function lastMovementByKey(movements: StockMovement[]): Map<string, StockMovement> {
  const result = new Map<string, StockMovement>();
  for (const m of movements) {
    const key = stockKey(m.productId, m.warehouseId);
    const when = m.movementDate ?? m.createdAt;
    const existing = result.get(key);
    const existingWhen = existing ? (existing.movementDate ?? existing.createdAt) : undefined;
    if (!existing || when > (existingWhen ?? '')) result.set(key, m);
  }
  return result;
}
