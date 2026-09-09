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
  /** "Supplier invoice", "Invoice", "Stock transfer" … — always present. */
  label: string;
  /**
   * The real business document number ("SI-2031", "INV-1072"). NEVER a
   * UUID and never the seed's machine `type:uuid` reference — `undefined`
   * when it could not be resolved (the caller then shows `label` alone).
   */
  number?: string;
  /** Canonical full-page route for the document, when one exists. */
  path?: string;
  /** Set when the document can be shown in <RelatedRecordPreview>. */
  previewType?: RelatedRecordType;
  /**
   * `true` when this was recovered by parsing a legacy `"<type>:<uuid>"`
   * free-text reference rather than from the structured
   * `source_document_type` / `source_document_id` columns. The caller can
   * still link, but the document number may be all it can show.
   */
  fromLegacyReference?: boolean;
  /** The raw machine reference / ids — for a collapsed "Technical details" block only, never the primary UI. */
  technicalReference?: string;
}

const META: Record<
  StockMovementSourceType,
  { label: string; route?: (id: string) => string; previewType?: RelatedRecordType }
> = {
  invoice: { label: 'Invoice', route: (id) => `/sales/invoices/${id}`, previewType: 'invoice' },
  bill: { label: 'Supplier invoice', route: (id) => `/purchases/bills/${id}`, previewType: 'bill' },
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
  if (LEGACY_REF_RE.test(value)) return true;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) return true;
  return false;
}

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const LEGACY_REF_RE = /^([a-z_]+):([0-9a-fA-F-]{16,})$/;

/** Every free-text `reference` prefix the app has ever written, mapped to its structured source type. */
const REFERENCE_PREFIX_TO_TYPE: Record<string, StockMovementSourceType> = {
  invoice: 'invoice',
  bill: 'bill',
  supplier_invoice: 'bill',
  credit_note: 'credit_note',
  purchase_order: 'purchase_order',
  purchase_order_receipt: 'purchase_order',
  goods_received: 'purchase_order',
  stock_adjustment: 'stock_adjustment',
  adjustment: 'stock_adjustment',
  stock_transfer: 'stock_transfer',
  transfer: 'stock_transfer',
  stock_take: 'stock_take',
  opening_stock: 'opening_stock_batch',
  opening_stock_batch: 'opening_stock_batch',
  supplier_return: 'supplier_return',
  delivery_note: 'delivery_note',
  return_note: 'return_note',
};

/**
 * Recover `{ type, id }` from a legacy `"<prefix>:<uuid>"` free-text
 * reference (e.g. `"purchase_order:3dcf3f9d-…"`), for movements whose
 * structured `source_document_type` / `source_document_id` were never
 * populated. Read-side only — nothing is written back.
 */
export function parseLegacyReference(
  reference: string | undefined | null,
): { type: StockMovementSourceType; id: string } | undefined {
  if (!reference) return undefined;
  const m = LEGACY_REF_RE.exec(reference.trim());
  if (!m) return undefined;
  const type = REFERENCE_PREFIX_TO_TYPE[m[1]];
  const idMatch = UUID_RE.exec(m[2]);
  if (!type || !idMatch) return undefined;
  return { type, id: idMatch[0] };
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
  const reference = input.reference ?? undefined;
  const usableReference = reference && !isOpaqueReference(reference) ? reference : undefined;

  // Prefer the structured columns; fall back to parsing a legacy
  // "<type>:<uuid>" free-text reference so a movement written before those
  // columns were populated still resolves and links.
  const legacy = !input.type || !input.id ? parseLegacyReference(reference) : undefined;
  const type = input.type ?? legacy?.type;
  const id = input.id ?? legacy?.id;
  const fromLegacyReference = !input.type && Boolean(legacy);

  if (!type) {
    return usableReference
      ? { label: 'Reference', number: usableReference, technicalReference: reference }
      : undefined;
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
    fromLegacyReference: fromLegacyReference || undefined,
    technicalReference: reference,
  };
}
