import type { BaseEntity, ID } from './common';

/**
 * A maintained per-(product, warehouse) balance cache (fork D; migration 0026).
 *
 * The `stock_movements` ledger stays the SOURCE OF TRUTH — this row is a cache
 * the read path can query without summing the whole ledger, kept in step with
 * the ledger by the inventory services and reconciled to it by an invariant
 * test. `Product.quantityOnHand` remains a second, company-wide-scalar cache
 * (= the sum of `quantityOnHand` across this product's `StockBalance` rows).
 */
export interface StockBalance extends BaseEntity {
  productId: ID;
  warehouseId: ID;
  quantityOnHand: number;
  /** Reserved by unfulfilled sales orders. 0 until SO reservations are wired. */
  quantityCommitted: number;
  /** Inbound on open purchase orders. 0 until open-PO quantities are wired. */
  quantityOnOrder: number;
}

/** `quantityOnHand − quantityCommitted + quantityOnOrder` (docs/INVENTORY_DOMAIN.md §3). */
export function quantityAvailable(balance: Pick<StockBalance, 'quantityOnHand' | 'quantityCommitted' | 'quantityOnOrder'>): number {
  return balance.quantityOnHand - balance.quantityCommitted + balance.quantityOnOrder;
}
