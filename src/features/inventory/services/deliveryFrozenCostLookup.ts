import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';

/**
 * Phase 5C (docs/DELIVERY_NOTES_DESIGN.md Part 7/15): the FROZEN cost
 * evidence a Delivery Note line's own `stock_movements` row carries —
 * `unit_cost`/`total_cost`, written once by `post_delivery_note` (migration
 * 0054) at the product's WAC AT THE MOMENT OF DELIVERY, never recomputed.
 * `invoiceService.postInvoice()` reads this to clear `1220 Goods Delivered
 * Not Invoiced` into COGS at exactly the delivery-time value — even if the
 * product's WAC has since moved. "Don't guess": a missing frozen-cost row
 * for a `deliveryNoteLineId` the invoice line itself claims is a genuine
 * data-integrity problem, never silently substituted with today's WAC (that
 * would corrupt margin — the exact bug Part 15 exists to prevent).
 */
export interface DeliveryFrozenCost {
  unitCost: number;
  totalCost: number;
}

export interface DeliveryFrozenCostLookup {
  getFrozenCost(deliveryNoteLineId: ID): Promise<DeliveryFrozenCost | undefined>;
}

/**
 * Default for every construction context that never sees a
 * `deliveryNoteLineId` (every existing test, every pre-5C call site) —
 * `postInvoice()` only ever calls this when a line actually carries one.
 */
export const noDeliveryFrozenCostLookup: DeliveryFrozenCostLookup = {
  getFrozenCost: async () => undefined,
};

interface StockMovementCostRow {
  unit_cost: number | string | null;
  total_cost: number | string | null;
}

/**
 * Production wiring: reads the ONE `stock_movements` row `post_delivery_note`
 * wrote for this Delivery Note line (`source_document_type = 'delivery_note'`,
 * `source_document_line_id = deliveryNoteLineId`) — the append-only ledger
 * is the sole, immutable source of this evidence (docs/DELIVERY_NOTES_DESIGN.md
 * Part 7), never re-derived from `products.cost_price`.
 */
export class RealDeliveryFrozenCostLookup implements DeliveryFrozenCostLookup {
  constructor(private readonly client: SupabaseClient) {}

  async getFrozenCost(deliveryNoteLineId: ID): Promise<DeliveryFrozenCost | undefined> {
    const { data, error } = await this.client
      .from('stock_movements')
      .select('unit_cost, total_cost')
      .eq('source_document_type', 'delivery_note')
      .eq('source_document_line_id', deliveryNoteLineId)
      .maybeSingle();
    if (error || !data) return undefined;
    const row = data as StockMovementCostRow;
    if (row.unit_cost == null || row.total_cost == null) return undefined;
    return { unitCost: Number(row.unit_cost), totalCost: Number(row.total_cost) };
  }
}
