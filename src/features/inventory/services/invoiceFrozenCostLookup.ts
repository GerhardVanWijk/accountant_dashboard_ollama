import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID } from '@/types';

/**
 * The FROZEN cost evidence an Invoice line's own `stock_movements` row
 * carries — `unit_cost`/`total_cost`, written once by
 * `InvoiceService.postInvoice()` at the product's WAC AT THE MOMENT OF SALE,
 * never recomputed. `CreditNoteService.issueCreditNote()` reads this so a
 * `reason: 'return'` credit note reverses the stock at the SAME cost it left
 * at, instead of today's (possibly since-moved) WAC — the fix for the
 * documented `docs/KNOWN_ISSUES.md` gap ("a return posts stock back in at
 * the product's CURRENT weighted-average cost, not the original sale's
 * historical/frozen cost"). Mirrors `deliveryFrozenCostLookup.ts` exactly,
 * scoped to `source_document_type = 'invoice'` instead of `'delivery_note'`
 * — a dedicated interface per source-document type is the established
 * convention here (see that file's own header), not a generic one.
 *
 * UNLIKE `postInvoice()`'s use of the delivery-note lookup, a missing frozen
 * cost here is NOT treated as a hard failure: an `originalInvoiceLineId`
 * link with no matching movement (pre-dates this evidence trail, or the
 * line was never actually tracked-inventory) falls back to the product's
 * CURRENT weighted-average cost — the same, already-accepted simplification
 * this class has always made. This is a genuine, honest limitation for
 * older/unevidenced records, not a data-integrity problem worth blocking a
 * credit note over.
 */
export interface InvoiceFrozenCost {
  unitCost: number;
  totalCost: number;
}

export interface InvoiceFrozenCostLookup {
  getFrozenCost(invoiceLineId: ID): Promise<InvoiceFrozenCost | undefined>;
}

/**
 * Default for every construction context that never sees an
 * `originalInvoiceLineId` (every existing test, every pre-Part-5 call site)
 * — `CreditNoteService` only ever calls this when a return line actually
 * carries one.
 */
export const noInvoiceFrozenCostLookup: InvoiceFrozenCostLookup = {
  getFrozenCost: async () => undefined,
};

interface StockMovementCostRow {
  unit_cost: number | string | null;
  total_cost: number | string | null;
}

/**
 * Production wiring: reads the ONE `stock_movements` row `postInvoice()`
 * wrote for this invoice line (`source_document_type = 'invoice'`,
 * `source_document_line_id = invoiceLineId`) — the append-only ledger is the
 * sole, immutable source of this evidence, never re-derived from
 * `products.cost_price`.
 */
export class RealInvoiceFrozenCostLookup implements InvoiceFrozenCostLookup {
  constructor(private readonly client: SupabaseClient) {}

  async getFrozenCost(invoiceLineId: ID): Promise<InvoiceFrozenCost | undefined> {
    const { data, error } = await this.client
      .from('stock_movements')
      .select('unit_cost, total_cost')
      .eq('source_document_type', 'invoice')
      .eq('source_document_line_id', invoiceLineId)
      .maybeSingle();
    if (error || !data) return undefined;
    const row = data as StockMovementCostRow;
    if (row.unit_cost == null || row.total_cost == null) return undefined;
    return { unitCost: Number(row.unit_cost), totalCost: Number(row.total_cost) };
  }
}
