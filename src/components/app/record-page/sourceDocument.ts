import type { StockMovementSourceType } from '@/types';

/**
 * Record types that <RelatedRecordPreview> can render as an over-the-page
 * overlay (each maps to an existing `*DetailPage` — no second renderer).
 */
export type RelatedRecordType =
  | 'invoice'
  | 'bill'
  | 'purchase_order'
  | 'credit_note'
  | 'sales_order'
  | 'quote'
  | 'supplier_return'
  | 'stock_transfer'
  | 'stock_adjustment'
  | 'stock_take'
  | 'opening_stock_batch'
  | 'delivery_note'
  | 'return_note';

/** A source-document reference resolved to something a human can read and navigate to. */
export interface ResolvedSourceDocument {
  type?: StockMovementSourceType;
  id?: string;
  /** "Bill", "Invoice", "Stock transfer" … — always present. */
  label: string;
  /**
   * The real business document number ("BILL-2031", "INV-1072"). NEVER a
   * UUID and never the seed's machine `type:uuid` reference — `undefined`
   * when it could not be resolved (the caller then shows `label` alone).
   */
  number?: string;
  /** Canonical full-page route for the document, when one exists. */
  path?: string;
  /** Set when the document can be shown in <RelatedRecordPreview>. */
  previewType?: RelatedRecordType;
}

const META: Record<
  StockMovementSourceType,
  { label: string; route?: (id: string) => string; previewType?: RelatedRecordType }
> = {
  invoice: { label: 'Invoice', route: (id) => `/sales/invoices/${id}`, previewType: 'invoice' },
  bill: { label: 'Bill', route: (id) => `/purchases/bills/${id}`, previewType: 'bill' },
  credit_note: { label: 'Credit note', route: (id) => `/sales/credit-notes/${id}`, previewType: 'credit_note' },
  purchase_order: { label: 'Purchase order', route: (id) => `/purchases/orders/${id}`, previewType: 'purchase_order' },
  stock_adjustment: { label: 'Stock adjustment', route: (id) => `/inventory/adjustments/${id}`, previewType: 'stock_adjustment' },
  stock_transfer: { label: 'Stock transfer', route: (id) => `/inventory/transfers/${id}`, previewType: 'stock_transfer' },
  stock_take: { label: 'Stock take', route: (id) => `/inventory/stock-takes/${id}`, previewType: 'stock_take' },
  opening_stock_batch: { label: 'Opening stock', route: (id) => `/inventory/opening-stock/${id}`, previewType: 'opening_stock_batch' },
  supplier_return: { label: 'Supplier return', route: (id) => `/inventory/supplier-returns/${id}`, previewType: 'supplier_return' },
  delivery_note: { label: 'Delivery note', route: (id) => `/sales/delivery-notes/${id}`, previewType: 'delivery_note' },
  return_note: { label: 'Return note', route: (id) => `/sales/return-notes/${id}`, previewType: 'return_note' },
  reversal: { label: 'Reversal' },
};

/**
 * `true` for a machine-generated reference that must never be shown to a
 * user — the September seed wrote `reference = "<type>:<uuid>"` (e.g.
 * `"bill:5eed0000-0000-4000-8000-700000000001"`) into the free-text
 * `reference` column while the structured `source_document_type` /
 * `source_document_id` carry the real link. Also treats a bare UUID as
 * opaque.
 */
export function isOpaqueReference(reference: string | undefined | null): boolean {
  if (!reference) return true;
  const value = reference.trim();
  if (/^[a-z_]+:[0-9a-fA-F-]{16,}$/.test(value)) return true;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) return true;
  return false;
}

/**
 * Resolves a stock movement's source into `{ label, number, path,
 * previewType }`. `resolveNumber(type, id)` is supplied by the caller
 * (it has the loaded document collections) and returns the real document
 * number or `undefined`. The free-text `reference` is used as a last
 * resort ONLY when it is not opaque.
 */
export function resolveSourceDocument(
  input: { type?: StockMovementSourceType; id?: string; reference?: string | null },
  resolveNumber?: (type: StockMovementSourceType, id: string) => string | undefined,
): ResolvedSourceDocument | undefined {
  const { type, id } = input;
  const reference = input.reference ?? undefined;
  const usableReference = reference && !isOpaqueReference(reference) ? reference : undefined;

  if (!type) {
    return usableReference ? { label: 'Reference', number: usableReference } : undefined;
  }

  const meta = META[type];
  const number = (id && resolveNumber ? resolveNumber(type, id) : undefined) ?? usableReference;

  return {
    type,
    id,
    label: meta.label,
    number,
    path: id && meta.route ? meta.route(id) : undefined,
    previewType: id ? meta.previewType : undefined,
  };
}
