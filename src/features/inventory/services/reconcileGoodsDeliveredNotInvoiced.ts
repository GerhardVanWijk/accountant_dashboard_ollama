import type { AccountMapper } from '@/features/accounting/services/accountMappingService';
import type { DeliveryNote, Invoice, Product, StockMovement } from '@/types';

/**
 * Phase 5C (docs/DELIVERY_NOTES_DESIGN.md Part 20) — "Goods Delivered Not
 * Invoiced" reconciliation: for every POSTED Delivery Note line, how much
 * of its delivered quantity has NOT yet been invoiced, valued at the
 * FROZEN cost `post_delivery_note` recorded on its own `stock_movements`
 * row — summed, this must equal GL 1220's posted balance. Deliberately a
 * SEPARATE reconciliation from `reconcileInventory()` (GL 1200 vs physical
 * stock valuation) — 1220 holds cost of goods ALREADY DELIVERED, not stock
 * still on hand, so mixing the two checks would be accounting-incorrect
 * (Part 19/20's own explicit instruction).
 */

export interface DeliveryLineReconciliationRow {
  deliveryNoteId: string;
  deliveryNoteNumber: string;
  customerId: string;
  salesOrderId: string;
  productId: string;
  productName: string;
  deliveredQty: number;
  invoicedQty: number;
  outstandingQty: number;
  frozenUnitCost: number;
  outstandingCost: number;
}

export interface GoodsDeliveredNotInvoicedResult {
  rows: DeliveryLineReconciliationRow[];
  totalOutstandingCost: number;
  glBalance: number;
  difference: number;
  isReconciled: boolean;
}

/** The minimal GL-ledger read surface this reconciliation needs — same shape `reconcileInventory` depends on. */
export interface ControlAccountLedger {
  getAccountLedger(accountId: string): Promise<ReadonlyArray<{ runningBalance: number }>>;
}

const EPSILON = 0.01;

export async function reconcileGoodsDeliveredNotInvoiced(
  input: {
    deliveryNotes: readonly DeliveryNote[];
    invoices: readonly Invoice[];
    products: readonly Product[];
    stockMovements: readonly StockMovement[];
  },
  accounts: AccountMapper,
  journalEntryService: ControlAccountLedger,
): Promise<GoodsDeliveredNotInvoicedResult> {
  const productById = new Map(input.products.map((p) => [p.id, p]));
  const movementByDeliveryLineId = new Map(
    input.stockMovements
      .filter((m) => m.sourceDocumentType === 'delivery_note' && m.sourceDocumentLineId)
      .map((m) => [m.sourceDocumentLineId as string, m]),
  );

  const invoicedByDeliveryLineId = new Map<string, number>();
  for (const inv of input.invoices) {
    if (inv.status === 'draft' || inv.status === 'void') continue;
    for (const line of inv.lineItems) {
      if (!line.deliveryNoteLineId) continue;
      invoicedByDeliveryLineId.set(
        line.deliveryNoteLineId,
        (invoicedByDeliveryLineId.get(line.deliveryNoteLineId) ?? 0) + (line.quantity ?? 0),
      );
    }
  }

  const rows: DeliveryLineReconciliationRow[] = [];
  for (const dn of input.deliveryNotes) {
    if (dn.status !== 'posted') continue;
    for (const line of dn.lineItems) {
      const deliveredQty = line.quantity;
      const invoicedQty = invoicedByDeliveryLineId.get(line.id) ?? 0;
      const outstandingQty = Math.max(0, deliveredQty - invoicedQty);
      if (outstandingQty <= 1e-6) continue;
      const movement = movementByDeliveryLineId.get(line.id);
      const frozenUnitCost = movement?.unitCost ?? 0;
      rows.push({
        deliveryNoteId: dn.id,
        deliveryNoteNumber: dn.deliveryNoteNumber,
        customerId: dn.customerId,
        salesOrderId: dn.salesOrderId,
        productId: line.productId,
        productName: productById.get(line.productId)?.name ?? line.productId,
        deliveredQty,
        invoicedQty,
        outstandingQty,
        frozenUnitCost,
        outstandingCost: Math.round(outstandingQty * frozenUnitCost * 100) / 100,
      });
    }
  }

  const totalOutstandingCost = Math.round(rows.reduce((sum, r) => sum + r.outstandingCost, 0) * 100) / 100;

  let glBalance = 0;
  try {
    const accountId = await accounts.getAccountId('GOODS_DELIVERED_NOT_INVOICED');
    const ledger = await journalEntryService.getAccountLedger(accountId);
    glBalance = ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : 0;
  } catch {
    // Account not yet created for this company (pre-Phase-5C data / migration 0053 not applied here) — 0 is correct, not hidden.
    glBalance = 0;
  }

  const difference = Math.round((totalOutstandingCost - glBalance) * 100) / 100;

  return {
    rows,
    totalOutstandingCost,
    glBalance,
    difference,
    isReconciled: Math.abs(difference) <= EPSILON,
  };
}
