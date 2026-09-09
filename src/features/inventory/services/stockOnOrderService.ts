import type { PurchaseOrder } from '@/types';
import type { IPurchaseOrderRepository } from '@/repositories/IPurchaseOrderRepository';
import { SupabasePurchaseOrderRepository } from '@/repositories/SupabasePurchaseOrderRepository';
import { supabase } from '@/config/supabase';
import type { IWarehouseRepository } from '../repositories/IWarehouseRepository';
import { warehouseRepository } from '../repositories/instances';
import { commitmentKey, getCommittedForProduct } from './stockCommitmentService';

/**
 * Derived "quantity on order" — inbound stock on OPEN purchase orders.
 *
 * `stock_balances.quantity_on_order` stays **0 in storage**: there is NO
 * schema change, NO migration and NO Supabase write. The value is recomputed
 * on read from open purchase-order lines, exactly the way `quantityCommitted`
 * is recomputed from confirmed sales-order lines
 * (`stockCommitmentService.ts`).
 *
 * ── What counts as "on order" ────────────────────────────────────────────
 * A purchase order line contributes its full ordered quantity when the PO is
 * a FIRM order that has not yet been received:
 *   status === 'sent'  AND  no linked bill  AND  no receipt journal posted.
 *
 * ── Documented limitations of the current PO lifecycle ───────────────────
 *  - `draft` POs are excluded — a draft is not a committed order.
 *  - Goods receipt is all-or-nothing per PO (`purchaseOrderService.recordReceipt`
 *    sets `status: 'received'` and stamps `journalEntryId`). The
 *    `partially_received` status exists on the type but **nothing produces
 *    it**, so there is no per-line remaining quantity to net — a PO is either
 *    fully on order or fully received.
 *  - A PO converted to a bill (`billId` set) is treated as no longer on order
 *    even if its status was left at `sent`, because `billService.postBill`
 *    recognises the stock. This avoids double-counting against the bill's own
 *    `goods_received` movement.
 *
 * This service is read-only and never posts, never creates a stock movement.
 */

export function isOpenPurchaseOrder(po: Pick<PurchaseOrder, 'status' | 'billId' | 'journalEntryId'>): boolean {
  if (po.status !== 'sent') return false;
  if (po.billId) return false;
  if (po.journalEntryId) return false;
  return true;
}

export interface StockOnOrderLookup {
  getOnOrderMap(): Promise<Map<string, number>>;
}

export class StockOnOrderService implements StockOnOrderLookup {
  constructor(
    private readonly poRepo: IPurchaseOrderRepository,
    private readonly warehouseRepo: IWarehouseRepository,
  ) {}

  /** Map keyed by `commitmentKey(productId, warehouseId)` → quantity inbound on open POs. */
  async getOnOrderMap(): Promise<Map<string, number>> {
    const [orders, warehouses] = await Promise.all([this.poRepo.getAll(), this.warehouseRepo.getAll()]);
    const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id;
    const map = new Map<string, number>();
    for (const po of orders) {
      if (!isOpenPurchaseOrder(po)) continue;
      for (const line of po.lineItems ?? []) {
        const qty = line.quantity ?? 0;
        if (!line.productId || qty <= 0) continue;
        const warehouseId = line.warehouseId ?? defaultWarehouseId;
        if (!warehouseId) continue;
        const key = commitmentKey(line.productId, warehouseId);
        map.set(key, (map.get(key) ?? 0) + qty);
      }
    }
    return map;
  }
}

/** Total on-order quantity across every warehouse for one product. */
export function getOnOrderForProduct(map: Map<string, number>, productId: string): number {
  return getCommittedForProduct(map, productId);
}

/** Grand total on order across every product / warehouse. */
export function totalOnOrder(map: Map<string, number>): number {
  let total = 0;
  for (const q of map.values()) total += q;
  return total;
}

/**
 * Singleton. A second Supabase-backed `SupabasePurchaseOrderRepository` is
 * safe here for the same reason as `stockCommitmentService`'s extra
 * repositories — a shared database has no in-memory divergence.
 */
export const stockOnOrderService = new StockOnOrderService(
  new SupabasePurchaseOrderRepository(supabase),
  warehouseRepository,
);
