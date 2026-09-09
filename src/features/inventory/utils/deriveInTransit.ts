import type { ID, StockTransfer } from '@/types';

/**
 * Read-side view of stock that has been DISPATCHED on an inter-warehouse
 * transfer but not yet RECEIVED — i.e. every transfer whose status is
 * `in_transit`. Between dispatch and receipt that quantity sits in no
 * warehouse's on-hand (the `transfer_out` movement has already reduced the
 * source warehouse; the `transfer_in` only lands on receipt), so without this
 * the company on-hand appears to drop with no explanation.
 *
 * This DERIVES nothing about valuation or GL — it reads the authoritative
 * transfer header status + line quantities. `reconcileInventory()` remains
 * the source of the in-transit *valuation* vs GL 1210.
 */

export interface InTransitLeg {
  transferId: ID;
  transferNumber: string;
  fromWarehouseId: ID;
  toWarehouseId: ID;
  transferDate: string;
  expectedReceiptDate?: string;
  /** Quantity of the queried product still in transit on this transfer. */
  quantity: number;
  /** `Σ line.totalCost` for the queried product on this transfer (cost captured at dispatch). */
  value: number;
}

export interface ProductInTransit {
  totalQuantity: number;
  totalValue: number;
  legs: InTransitLeg[];
}

const EMPTY: ProductInTransit = { totalQuantity: 0, totalValue: 0, legs: [] };

/** In-transit legs (and totals) for one product across every `in_transit` transfer. */
export function inTransitForProduct(transfers: StockTransfer[], productId: ID): ProductInTransit {
  const legs: InTransitLeg[] = [];
  for (const t of transfers) {
    if (t.status !== 'in_transit') continue;
    const lines = (t.lineItems ?? []).filter((l) => l.productId === productId);
    if (lines.length === 0) continue;
    const quantity = lines.reduce((sum, l) => sum + l.quantity, 0);
    const value = round2(lines.reduce((sum, l) => sum + l.totalCost, 0));
    legs.push({
      transferId: t.id,
      transferNumber: t.transferNumber,
      fromWarehouseId: t.fromWarehouseId,
      toWarehouseId: t.toWarehouseId,
      transferDate: t.transferDate,
      expectedReceiptDate: t.expectedReceiptDate,
      quantity,
      value,
    });
  }
  if (legs.length === 0) return EMPTY;
  return {
    totalQuantity: legs.reduce((sum, l) => sum + l.quantity, 0),
    totalValue: round2(legs.reduce((sum, l) => sum + l.value, 0)),
    legs,
  };
}

/** Every `in_transit` transfer, with its own total line quantity/value — company-wide "transfers in progress". */
export function transfersInProgress(transfers: StockTransfer[]): {
  transfer: StockTransfer;
  quantity: number;
  value: number;
}[] {
  return transfers
    .filter((t) => t.status === 'in_transit')
    .map((transfer) => ({
      transfer,
      quantity: (transfer.lineItems ?? []).reduce((sum, l) => sum + l.quantity, 0),
      value: round2((transfer.lineItems ?? []).reduce((sum, l) => sum + l.totalCost, 0)),
    }));
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
