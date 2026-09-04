import type { StockBalance } from '@/types';
import { commitmentKey } from '../services/stockCommitmentService';

/**
 * Read-path projection for the derived stock-commitment model (Phase 5A).
 * `stock_balances.quantity_committed` is always 0 in storage; this replaces it
 * on the fetched rows with the real derived value from a commitment map
 * (`stockCommitmentService.getCommitmentMap()`), so every downstream display
 * rollup (`buildInventoryRows`, `buildStockOnHandRows`, the item-detail Stock
 * tab) shows a true Available without any of them changing shape.
 *
 * Synthetic rows: a commitment key with no matching balance row is stock
 * committed against a (product, warehouse) that has never physically held
 * stock. That is a real, reportable position — Available must show negative —
 * and the row builders only ever iterate the rows they are handed, so a
 * zero-on-hand `synthetic_<key>` row is emitted for it. Synthetic rows carry
 * empty `createdAt` / `updatedAt` and are never written back anywhere.
 */
export function applyStockCommitments(
  balances: StockBalance[],
  commitments: Map<string, number>,
): StockBalance[] {
  const matched = new Set<string>();
  const hydrated = balances.map((balance) => {
    const key = commitmentKey(balance.productId, balance.warehouseId);
    matched.add(key);
    return { ...balance, quantityCommitted: commitments.get(key) ?? 0 };
  });

  for (const [key, quantity] of commitments) {
    if (quantity === 0 || matched.has(key)) continue;
    const separator = key.indexOf('__');
    if (separator < 0) continue;
    hydrated.push({
      id: `synthetic_${key}`,
      productId: key.slice(0, separator),
      warehouseId: key.slice(separator + 2),
      quantityOnHand: 0,
      quantityCommitted: quantity,
      quantityOnOrder: 0,
      createdAt: '',
      updatedAt: '',
    });
  }

  return hydrated;
}
