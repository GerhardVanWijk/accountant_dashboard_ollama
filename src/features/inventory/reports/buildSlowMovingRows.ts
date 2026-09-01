import type { StockMovement, StockMovementType } from '@/types';
import type { StockOnHandRow } from './buildStockOnHandRows';
import { lastMovementByKey, stockKey } from './lastMovementByKey';

export type SlowMovingBucket = '0-30' | '31-60' | '61-90' | '91-180' | '180+';

export const SLOW_MOVING_BUCKET_LABEL: Record<SlowMovingBucket, string> = {
  '0-30': '0–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '91-180': '91–180 days',
  '180+': '180+ days',
};

/**
 * "Movement" for this report means any ECONOMIC event — everything except
 * `transfer_in`/`transfer_out` (a transfer relocates stock between
 * warehouses; it neither consumes nor replenishes it company-wide — the
 * same "inventory-affecting" convention `reconcileInventory()` already uses
 * for its own subledger-vs-GL check) and `opening` (a one-time balance
 * seed, not activity). Spec §16 explicitly asks whether transfers should
 * count — this app answers no, for the same reason `reconcileInventory()`
 * excludes them from its inventory-affecting posting count.
 */
const ECONOMIC_MOVEMENT_TYPES = new Set<StockMovementType>([
  'goods_received',
  'sale',
  'sales_return',
  'purchase_return',
  'write_off',
  'stock_gain',
  'stock_take',
  'adjustment',
  'correction',
]);

export interface SlowMovingRow extends StockOnHandRow {
  /** Last ECONOMIC movement (see above) — `undefined` if none has ever been recorded for this (product, warehouse) beyond the opening balance. */
  lastMovementAt: string | undefined;
  daysSinceLastMovement: number | undefined;
  /** Last movement SPECIFICALLY of type `'sale'` — spec §16's "prefer sales/consumption movement" — kept as its own field precisely so a row with recent purchase activity but NO sale ever is visible as such, not hidden behind the more permissive `lastMovementAt`. */
  lastSaleAt: string | undefined;
  bucket: SlowMovingBucket;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Slow-Moving / Dead Stock (spec §16) — only products currently holding
 * quantity (`onHand > 0`; a zero-quantity item has no carrying value to flag
 * as dead) are bucketed by days since their last ECONOMIC movement (see
 * `ECONOMIC_MOVEMENT_TYPES` above). `lastSaleAt` is reported alongside so a
 * "recently active but never actually sold" item (e.g. bought in, never
 * moved out) is honestly distinguishable from a genuinely recently-sold one
 * — spec's own suggestion to prefer sales/consumption evidence where the
 * source allows it, without hiding the limitation where it doesn't (this
 * schema has no separate "last consumed" concept beyond movement type).
 */
export function buildSlowMovingRows(stockOnHandRows: StockOnHandRow[], movements: StockMovement[], asOfDate: Date): SlowMovingRow[] {
  const economicMovements = movements.filter((m) => ECONOMIC_MOVEMENT_TYPES.has(m.type));
  const lastEconomic = lastMovementByKey(economicMovements);
  const lastSale = lastMovementByKey(movements.filter((m) => m.type === 'sale'));
  const asOfMs = asOfDate.getTime();

  return stockOnHandRows
    .filter((r) => r.onHand > 0)
    .map((r) => {
      const key = stockKey(r.product.id, r.warehouse.id);
      const lastMovement = lastEconomic.get(key);
      const lastMovementAt = lastMovement ? (lastMovement.movementDate ?? lastMovement.createdAt) : undefined;
      const lastSaleMovement = lastSale.get(key);
      const lastSaleAt = lastSaleMovement ? (lastSaleMovement.movementDate ?? lastSaleMovement.createdAt) : undefined;
      const daysSinceLastMovement =
        lastMovementAt !== undefined ? Math.floor((asOfMs - new Date(lastMovementAt).getTime()) / MS_PER_DAY) : undefined;

      return { ...r, lastMovementAt, daysSinceLastMovement, lastSaleAt, bucket: bucketFor(daysSinceLastMovement) };
    });
}

function bucketFor(days: number | undefined): SlowMovingBucket {
  // No recorded economic movement at all is the deepest-dead case — bucketed
  // as 180+ rather than given a false "recent" reading.
  if (days === undefined || days > 180) return '180+';
  if (days > 90) return '91-180';
  if (days > 60) return '61-90';
  if (days > 30) return '31-60';
  return '0-30';
}
