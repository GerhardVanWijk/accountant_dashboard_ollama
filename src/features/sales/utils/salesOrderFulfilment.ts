import type { DeliveryNote, DocumentLineItem, ID, Invoice, ReturnNote, SalesOrder } from '@/types';

/**
 * Derived Sales Order fulfilment / invoicing quantities (Phase 5B.1 / 5B.3).
 *
 * NOTHING here is a stored counter. `postedFulfilledQty` and everything derived
 * from it are recomputed on read from the invoices that reference the Sales
 * Order — a **posted** invoice line is immutable (`InvoiceService.updateInvoice`
 * blocks accounting-relevant edits past `draft`; delete is draft-only;
 * corrections go through credit notes), so `Σ` of those quantities is stable,
 * monotonic evidence that cannot drift the way a mutable counter would.
 *
 * Operating model for THIS phase (docs/SALES_FULFILMENT.md §"NON-NEGOTIABLE
 * ACCOUNTING MODEL"): a POSTED inventory invoice IS the physical fulfilment
 * event — there is no separate delivery/dispatch document yet. Hence
 * `fulfilmentStatus` and `invoicingStatus` coincide here; they are kept as
 * separate fields so Phase 5C can give fulfilment its own independent source
 * without a breaking change. The field is `fulfilledQty`, deliberately NOT
 * `deliveredQty` — there is no independent delivery evidence to justify that
 * name.
 */

/** rounds a quantity to 3dp (matches `numeric(14,3)` on the normalized line tables) so float dust never tips a comparison. */
function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** rounds money to 2dp (matches every `numeric(14,2)` amount column). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const EPSILON = 1e-6;

/**
 * An invoice counts as a physical fulfilment + revenue event once it is
 * POSTED — anything past `draft` and not `void`. Mirrors the predicate in
 * `src/features/accounting/services/subledgerReconciliation.ts`.
 */
export function isPostedInvoiceStatus(status: Invoice['status']): boolean {
  return status !== 'draft' && status !== 'void';
}

export function isDraftInvoiceStatus(status: Invoice['status']): boolean {
  return status === 'draft';
}

/**
 * Sum invoice-line quantities grouped by the Sales Order line they fulfil
 * (`line.salesOrderLineId`), across the invoices that match `predicate`.
 * Invoice lines with no `salesOrderLineId` contribute nothing — a legacy
 * conversion (pre-5B.1) or a hand-written invoice is simply invisible to the
 * per-line derivation (see `hasLineLevelEvidence`).
 */
export function sumInvoicedBySalesOrderLine(
  invoices: readonly Invoice[],
  predicate: (inv: Invoice) => boolean,
): Map<ID, number> {
  const map = new Map<ID, number>();
  for (const inv of invoices) {
    if (!predicate(inv)) continue;
    for (const line of inv.lineItems) {
      const soLineId = line.salesOrderLineId;
      if (!soLineId) continue;
      map.set(soLineId, roundQty((map.get(soLineId) ?? 0) + (line.quantity ?? 0)));
    }
  }
  return map;
}

/**
 * Sum a Delivery Note's line quantities grouped by the Sales Order line they
 * fulfil (`line.salesOrderLineId`), across delivery notes matching
 * `predicate`. Phase 5C (docs/DELIVERY_NOTES_DESIGN.md Part 8) — mirrors
 * `sumInvoicedBySalesOrderLine` exactly, one level up (Delivery Note lines
 * instead of invoice lines).
 */
export function sumDeliveredBySalesOrderLine(
  deliveryNotes: readonly DeliveryNote[],
  predicate: (dn: DeliveryNote) => boolean,
): Map<ID, number> {
  const map = new Map<ID, number>();
  for (const dn of deliveryNotes) {
    if (!predicate(dn)) continue;
    for (const line of dn.lineItems) {
      map.set(line.salesOrderLineId, roundQty((map.get(line.salesOrderLineId) ?? 0) + (line.quantity ?? 0)));
    }
  }
  return map;
}

/** A Delivery Note counts as physical evidence once `posted` — a `draft`/`cancelled` one never moved stock. */
export function isPostedDeliveryNoteStatus(status: DeliveryNote['status']): boolean {
  return status === 'posted';
}

/** A Return Note counts as physical evidence once `posted` — a `draft`/`cancelled` one never reversed stock (mirrors `isPostedDeliveryNoteStatus`). */
export function isPostedReturnNoteStatus(status: ReturnNote['status']): boolean {
  return status === 'posted';
}

/**
 * Sum a Return Note's line quantities grouped by the Sales Order line the
 * underlying delivery fulfilled (`ReturnNoteLineItem.salesOrderLineId`,
 * carried through from the Delivery Note line it reverses), across return
 * notes matching `predicate`. Mirrors `sumDeliveredBySalesOrderLine` exactly
 * — a Return Note is Delivery Note evidence run in reverse (Part 1 of the
 * completion-run stabilization brief).
 */
export function sumReturnedBySalesOrderLine(
  returnNotes: readonly ReturnNote[],
  predicate: (rn: ReturnNote) => boolean,
): Map<ID, number> {
  const map = new Map<ID, number>();
  for (const rn of returnNotes) {
    if (!predicate(rn)) continue;
    for (const line of rn.lineItems) {
      map.set(line.salesOrderLineId, roundQty((map.get(line.salesOrderLineId) ?? 0) + (line.quantity ?? 0)));
    }
  }
  return map;
}

/**
 * Sum invoice-line quantities grouped by Sales Order line, across invoices
 * matching `predicate`, EXCLUDING any line that carries `deliveryNoteLineId`
 * — Phase 5C's "directlyInvoicedQty" (docs/DELIVERY_NOTES_DESIGN.md Part 8):
 * a delivery-linked line represents fulfilment ALREADY counted via
 * `sumDeliveredBySalesOrderLine`, so excluding it here is the
 * double-subtraction guard, the exact TypeScript mirror of migration 0054's
 * / 0055's own `not (l.value ? 'deliveryNoteLineId')` SQL filter.
 */
export function sumDirectlyInvoicedBySalesOrderLine(
  invoices: readonly Invoice[],
  predicate: (inv: Invoice) => boolean,
): Map<ID, number> {
  const map = new Map<ID, number>();
  for (const inv of invoices) {
    if (!predicate(inv)) continue;
    for (const line of inv.lineItems) {
      const soLineId = line.salesOrderLineId;
      if (!soLineId || line.deliveryNoteLineId) continue;
      map.set(soLineId, roundQty((map.get(soLineId) ?? 0) + (line.quantity ?? 0)));
    }
  }
  return map;
}

/**
 * Σ `netDeliveredQty + directlyInvoicedQty` per Sales Order line, across
 * EVERY order (SO line ids are globally unique UUIDs, so one combined map
 * serves every order — same convention `stockCommitmentService`'s pre-5C
 * `sumInvoicedBySalesOrderLine` call already used). `netDeliveredQty =
 * max(0, deliveredQty − returnedUninvoicedQty)` (Part 1 of the
 * completion-run stabilization brief — a posted Return Note hands
 * delivered-but-uninvoiced stock back, so it must free up commitment /
 * remaining-to-deliver exactly the way it freed up physical stock). This IS
 * the "physical departure" total the Phase 5C commitment formula (Part 3)
 * subtracts from `orderedQty`: `committedQty = max(0, orderedQty −
 * physicalFulfilledQty)`. Reduces to the pre-5D `deliveredQty +
 * directlyInvoicedQty` exactly when no Return Note has ever been posted
 * (returnedQty empty), and further to the pre-5C `Σ posted invoice-line
 * qty` exactly when no Delivery Note has ever been posted either — proven
 * in `stockCommitmentService.test.ts` / `salesOrderFulfilment.test.ts`.
 */
export function sumPhysicallyIssuedBySalesOrderLine(
  invoices: readonly Invoice[],
  deliveryNotes: readonly DeliveryNote[],
  returnNotes: readonly ReturnNote[] = [],
): Map<ID, number> {
  const delivered = sumDeliveredBySalesOrderLine(deliveryNotes, (dn) => isPostedDeliveryNoteStatus(dn.status));
  const returned = sumReturnedBySalesOrderLine(returnNotes, (rn) => isPostedReturnNoteStatus(rn.status));
  const map = new Map<ID, number>();
  for (const [key, qty] of delivered) {
    map.set(key, Math.max(0, roundQty(qty - (returned.get(key) ?? 0))));
  }
  const directlyInvoiced = sumDirectlyInvoicedBySalesOrderLine(invoices, (i) => isPostedInvoiceStatus(i.status));
  for (const [key, qty] of directlyInvoiced) {
    map.set(key, roundQty((map.get(key) ?? 0) + qty));
  }
  return map;
}

export type FulfilmentStatus = 'not_fulfilled' | 'partially_fulfilled' | 'fulfilled';
export type InvoicingStatus = 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced';

export interface SalesOrderLineFulfilment {
  salesOrderLineId: ID;
  productId?: ID;
  warehouseId?: ID;
  description: string;
  orderedQty: number;
  /** Σ POSTED (non-draft, non-void) invoice-line qty linked to this SO line. The authoritative "progress". */
  postedFulfilledQty: number;
  /** Σ DRAFT invoice-line qty linked to this SO line. Gates the quantity picker only — never releases stock commitment. */
  draftInvoicedQty: number;
  /** `max(0, orderedQty − postedFulfilledQty)` — the physical shortfall = the open stock commitment for this line (5B.3). */
  remainingToFulfilQty: number;
  /** `max(0, orderedQty − postedFulfilledQty − draftInvoicedQty)` — what a NEW invoice line may still bill against this SO line. */
  remainingToInvoiceQty: number;
  /** true when `postedFulfilledQty > orderedQty` — should never happen through the guarded path; surfaced so the UI/QA can flag legacy or manual data. */
  overFulfilled: boolean;
  /**
   * Phase 5C (docs/DELIVERY_NOTES_DESIGN.md Part 8) — Σ POSTED Delivery Note
   * line qty linked to this SO line. `0` for every SO that has never had a
   * Delivery Note posted against it (every SO before Phase 5C, forever,
   * unless one is later posted).
   */
  deliveredQty: number;
  /**
   * Phase 5D (completion-run stabilization, Part 1) — Σ POSTED Return Note
   * line qty tracing back to this SO line. A Return Note only ever exists
   * against delivered-but-not-yet-invoiced goods, so this can never exceed
   * `deliveredQty`. `0` for every SO that has never had a Return Note
   * posted against it.
   */
  returnedQty: number;
  /** `max(0, deliveredQty − returnedQty)` — physically-departed stock still out with the customer, uninvoiced. */
  netDeliveredQty: number;
  /**
   * Σ POSTED invoice-line qty linked to this SO line carrying NO
   * `deliveryNoteLineId` — the "direct fulfilment" path, unrestricted by
   * delivery status (Part 13). Reduces to `postedFulfilledQty` when
   * `deliveredQty` is 0 for every line (proven below).
   */
  directlyInvoicedQty: number;
  /** `netDeliveredQty + directlyInvoicedQty` — the true physical-departure total, never double-counting a delivered-then-invoiced quantity, and never counting stock that has since come back uninvoiced. */
  physicalFulfilledQty: number;
  /**
   * `max(0, orderedQty − physicalFulfilledQty)` — the NEW commitment-driving
   * formula (Part 3/8, netted for Return Notes at Part 1 of the
   * completion-run stabilization). Reduces byte-identically to the pre-5C
   * `remainingToFulfilQty` whenever `deliveredQty` is 0 — proven by
   * `deliveryNotesMigrations.test.ts`'s formal quantity-matrix proof and by
   * `salesOrderFulfilment.test.ts`.
   */
  remainingToDeliver: number;
}

export interface SalesOrderFulfilment {
  lines: SalesOrderLineFulfilment[];
  orderedQty: number;
  postedFulfilledQty: number;
  draftInvoicedQty: number;
  remainingToFulfilQty: number;
  remainingToInvoiceQty: number;
  /** Phase 5C aggregate — see `SalesOrderLineFulfilment.deliveredQty`. */
  deliveredQty: number;
  /** Phase 5D aggregate — see `SalesOrderLineFulfilment.returnedQty`. */
  returnedQty: number;
  /** Phase 5D aggregate — see `SalesOrderLineFulfilment.netDeliveredQty`. */
  netDeliveredQty: number;
  /** Phase 5C aggregate — see `SalesOrderLineFulfilment.directlyInvoicedQty`. */
  directlyInvoicedQty: number;
  /** Phase 5C/5D aggregate — `netDeliveredQty + directlyInvoicedQty`. */
  physicalFulfilledQty: number;
  /** Phase 5C aggregate — Σ per-line `remainingToDeliver` (summed per-line, not `orderedQty − physicalFulfilledQty`, so an over-delivered line can't mask a still-open line — same discipline as `remainingToFulfilQty`). */
  remainingToDeliver: number;
  fulfilmentStatus: FulfilmentStatus;
  invoicingStatus: InvoicingStatus;
  /** ids of every non-void invoice with `salesOrderId === order.id`, in the order given. */
  relatedInvoiceIds: ID[];
  /**
   * true when at least one linked invoice carries line-level `salesOrderLineId`
   * evidence. When false and `legacyLinkedInvoiceIds` is non-empty, the
   * per-line numbers here are not trustworthy for that order (it was converted
   * before Phase 5B.1) — the UI should fall back to the commercial status.
   */
  hasLineLevelEvidence: boolean;
  /** non-void linked invoices carrying NO line-level evidence (legacy full conversions). */
  legacyLinkedInvoiceIds: ID[];
}

function classifyFulfilment(posted: number, ordered: number): FulfilmentStatus {
  if (posted <= EPSILON) return 'not_fulfilled';
  if (posted >= ordered - EPSILON) return 'fulfilled';
  return 'partially_fulfilled';
}

function classifyInvoicing(posted: number, ordered: number): InvoicingStatus {
  if (posted <= EPSILON) return 'not_invoiced';
  if (posted >= ordered - EPSILON) return 'fully_invoiced';
  return 'partially_invoiced';
}

/**
 * Compute the full derived fulfilment picture for one Sales Order from the
 * complete invoice list. Pure — no I/O.
 */
export function computeSalesOrderFulfilment(
  order: Pick<SalesOrder, 'id' | 'lineItems' | 'status'>,
  invoices: readonly Invoice[],
  /**
   * Phase 5C — posted Delivery Note evidence. Optional, defaults to `[]` so
   * every pre-5C call site (and every existing test) is byte-unchanged:
   * with no Delivery Notes, `deliveredQty` is 0 for every line and
   * `remainingToDeliver`/`remainingToFulfilQty` become numerically
   * identical (proven in `salesOrderFulfilment.test.ts`).
   */
  deliveryNotes: readonly DeliveryNote[] = [],
  /**
   * Phase 5D (completion-run stabilization, Part 1) — posted Return Note
   * evidence. Optional, defaults to `[]` so every pre-5D call site (and
   * every existing test) is byte-unchanged: with no Return Notes,
   * `returnedQty` is 0 for every line and `netDeliveredQty` collapses to
   * `deliveredQty` exactly.
   */
  returnNotes: readonly ReturnNote[] = [],
): SalesOrderFulfilment {
  const linked = invoices.filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void');
  const postedByLine = sumInvoicedBySalesOrderLine(linked, (i) => isPostedInvoiceStatus(i.status));
  const draftByLine = sumInvoicedBySalesOrderLine(linked, (i) => isDraftInvoiceStatus(i.status));

  const linkedDeliveryNotes = deliveryNotes.filter((dn) => dn.salesOrderId === order.id);
  const deliveredByLine = sumDeliveredBySalesOrderLine(linkedDeliveryNotes, (dn) => isPostedDeliveryNoteStatus(dn.status));
  const linkedReturnNotes = returnNotes.filter((rn) => rn.salesOrderId === order.id);
  const returnedByLine = sumReturnedBySalesOrderLine(linkedReturnNotes, (rn) => isPostedReturnNoteStatus(rn.status));
  const directlyInvoicedByLine = sumDirectlyInvoicedBySalesOrderLine(linked, (i) => isPostedInvoiceStatus(i.status));

  const lines: SalesOrderLineFulfilment[] = order.lineItems.map((l) => {
    const orderedQty = Math.max(0, roundQty(l.quantity ?? 0));
    const postedFulfilledQty = postedByLine.get(l.id) ?? 0;
    const draftInvoicedQty = draftByLine.get(l.id) ?? 0;
    const deliveredQty = deliveredByLine.get(l.id) ?? 0;
    const returnedQty = returnedByLine.get(l.id) ?? 0;
    const netDeliveredQty = Math.max(0, roundQty(deliveredQty - returnedQty));
    const directlyInvoicedQty = directlyInvoicedByLine.get(l.id) ?? 0;
    const physicalFulfilledQty = roundQty(netDeliveredQty + directlyInvoicedQty);
    return {
      salesOrderLineId: l.id,
      productId: l.productId,
      warehouseId: l.warehouseId,
      description: l.description,
      orderedQty,
      postedFulfilledQty,
      draftInvoicedQty,
      remainingToFulfilQty: Math.max(0, roundQty(orderedQty - postedFulfilledQty)),
      remainingToInvoiceQty: Math.max(0, roundQty(orderedQty - postedFulfilledQty - draftInvoicedQty)),
      overFulfilled: postedFulfilledQty > orderedQty + EPSILON,
      deliveredQty,
      returnedQty,
      netDeliveredQty,
      directlyInvoicedQty,
      physicalFulfilledQty,
      remainingToDeliver: Math.max(0, roundQty(orderedQty - physicalFulfilledQty)),
    };
  });

  const orderedQty = roundQty(lines.reduce((s, l) => s + l.orderedQty, 0));
  const postedFulfilledQty = roundQty(lines.reduce((s, l) => s + l.postedFulfilledQty, 0));
  const draftInvoicedQty = roundQty(lines.reduce((s, l) => s + l.draftInvoicedQty, 0));
  const deliveredQty = roundQty(lines.reduce((s, l) => s + l.deliveredQty, 0));
  const returnedQty = roundQty(lines.reduce((s, l) => s + l.returnedQty, 0));
  const netDeliveredQty = roundQty(lines.reduce((s, l) => s + l.netDeliveredQty, 0));
  const directlyInvoicedQty = roundQty(lines.reduce((s, l) => s + l.directlyInvoicedQty, 0));
  const legacyLinkedInvoiceIds = linked
    .filter((inv) => inv.lineItems.length > 0 && inv.lineItems.every((l) => !l.salesOrderLineId))
    .map((inv) => inv.id);

  return {
    lines,
    orderedQty,
    postedFulfilledQty,
    draftInvoicedQty,
    // Sum the per-line clamped values (not `orderedQty − postedFulfilledQty`)
    // so an over-fulfilled line can't mask a still-open line in the aggregate.
    remainingToFulfilQty: roundQty(lines.reduce((s, l) => s + l.remainingToFulfilQty, 0)),
    remainingToInvoiceQty: roundQty(lines.reduce((s, l) => s + l.remainingToInvoiceQty, 0)),
    deliveredQty,
    returnedQty,
    netDeliveredQty,
    directlyInvoicedQty,
    physicalFulfilledQty: roundQty(netDeliveredQty + directlyInvoicedQty),
    remainingToDeliver: roundQty(lines.reduce((s, l) => s + l.remainingToDeliver, 0)),
    fulfilmentStatus: classifyFulfilment(postedFulfilledQty, orderedQty),
    invoicingStatus: classifyInvoicing(postedFulfilledQty, orderedQty),
    relatedInvoiceIds: linked.map((inv) => inv.id),
    hasLineLevelEvidence: postedByLine.size > 0 || draftByLine.size > 0,
    legacyLinkedInvoiceIds,
  };
}

/**
 * The invoicing status to SHOW for an order, tolerating legacy data: a
 * pre-5B.1 `fulfilled` order whose linked invoice carries no line-level
 * evidence reads as fully invoiced even though the per-line derivation can't
 * see it. Everything else uses the honest derived value.
 */
export function displayInvoicingStatus(
  order: Pick<SalesOrder, 'status'>,
  fulfilment: Pick<SalesOrderFulfilment, 'invoicingStatus' | 'hasLineLevelEvidence' | 'legacyLinkedInvoiceIds'>,
): InvoicingStatus {
  if (
    !fulfilment.hasLineLevelEvidence &&
    fulfilment.legacyLinkedInvoiceIds.length > 0 &&
    (order.status === 'fulfilled' || order.status === 'cancelled')
  ) {
    return 'fully_invoiced';
  }
  return fulfilment.invoicingStatus;
}

/**
 * One SO line and how much of it a NEW invoice from that Sales Order should
 * bill. `remainingToInvoiceQty` counts BOTH draft and posted linked invoice
 * lines as already taken, so calling `convertToInvoice` twice never produces
 * a duplicate draft for the same quantity.
 */
export interface InvoiceableSalesOrderLine {
  salesOrderLineId: ID;
  source: DocumentLineItem;
  /** the quantity this new invoice should carry for that SO line (`orderedQty − draft − posted`, > 0). */
  quantity: number;
  /** `source.lineTotal` scaled by `quantity / orderedQty`, rounded to 2dp (== source when billing the whole line). */
  lineTotal: number;
  /** `source.taxAmount` scaled the same way. */
  taxAmount: number;
}

/**
 * The SO lines a new invoice from `order` should bill, with each line's
 * remaining quantity and proportionally-scaled totals. Pure — no id
 * generation, no I/O. Returns `[]` when nothing is left to invoice.
 */
export function invoiceableSalesOrderLines(
  order: Pick<SalesOrder, 'id' | 'lineItems'>,
  invoices: readonly Invoice[],
): InvoiceableSalesOrderLine[] {
  const linked = invoices.filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void');
  const takenByLine = sumInvoicedBySalesOrderLine(linked, () => true);
  const out: InvoiceableSalesOrderLine[] = [];
  for (const l of order.lineItems) {
    const ordered = Math.max(0, roundQty(l.quantity ?? 0));
    if (ordered <= EPSILON) continue;
    const remaining = roundQty(ordered - (takenByLine.get(l.id) ?? 0));
    if (remaining <= EPSILON) continue;
    const factor = remaining / ordered;
    out.push({
      salesOrderLineId: l.id,
      source: l,
      quantity: remaining,
      lineTotal: factor >= 1 - EPSILON ? round2(l.lineTotal ?? 0) : round2((l.lineTotal ?? 0) * factor),
      taxAmount: factor >= 1 - EPSILON ? round2(l.taxAmount ?? 0) : round2((l.taxAmount ?? 0) * factor),
    });
  }
  return out;
}

/**
 * true once every SO line is fully covered by linked (draft + posted, non-void)
 * invoice lines. Used by the picker's "everything is at least drafted" state,
 * NOT for the stored status flip (a draft can be deleted).
 */
export function isFullyInvoiced(
  order: Pick<SalesOrder, 'id' | 'lineItems'>,
  invoices: readonly Invoice[],
): boolean {
  const linked = invoices.filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void');
  if (linked.length === 0) return false;
  const takenByLine = sumInvoicedBySalesOrderLine(linked, () => true);
  return order.lineItems.every((l) => (takenByLine.get(l.id) ?? 0) >= (l.quantity ?? 0) - EPSILON);
}

/**
 * true once every SO line is fully covered by **POSTED** (non-draft, non-void)
 * linked invoice lines — the point at which the stored commercial status flips
 * to the legacy `fulfilled`. Uses posted-only so deleting or editing a DRAFT
 * invoice can never leave the SO stuck at a stale `fulfilled`
 * (docs/SALES_FULFILMENT.md §"draft-vs-posted"). Returns false with no lines /
 * no linked invoices.
 */
export function isFullyPostedInvoiced(
  order: Pick<SalesOrder, 'id' | 'lineItems'>,
  invoices: readonly Invoice[],
): boolean {
  if (order.lineItems.length === 0) return false;
  const postedByLine = sumInvoicedBySalesOrderLine(
    invoices.filter((inv) => inv.salesOrderId === order.id),
    (inv) => isPostedInvoiceStatus(inv.status),
  );
  if (postedByLine.size === 0) return false;
  return order.lineItems.every((l) => (postedByLine.get(l.id) ?? 0) >= (l.quantity ?? 0) - EPSILON);
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 5B.2 — explicit partial-invoice selections
// ────────────────────────────────────────────────────────────────────────────

/** Quantity columns are `numeric(14,3)` — a selection with more precision is rejected, never silently rounded. */
export const QUANTITY_DECIMALS = 3;

/**
 * Semantics recap (docs/SALES_FULFILMENT.md §13):
 *   orderedQty            = SO line quantity (stored)
 *   postedFulfilledQty    = Σ POSTED (non-draft, non-void) linked invoice-line qty  →  drives fulfilment + commitment
 *   draftInvoicedQty      = Σ DRAFT linked invoice-line qty                          →  drives NOTHING accounting; only the picker
 *   remainingToFulfilQty  = max(0, orderedQty − postedFulfilledQty)                  →  the physical shortfall = the stock commitment (5B.3)
 *   remainingToInvoiceQty = max(0, orderedQty − postedFulfilledQty − draftInvoicedQty)  →  "available to add to a NEW draft" — the 5B.2 picker cap
 *
 * `remainingToInvoiceQty` is what a new invoice line may bill: it already
 * excludes quantities sitting in an existing DRAFT invoice, so two drafts can
 * never be built that together exceed the ordered quantity (which would let a
 * later double-post over-invoice the SO).
 */
export interface SalesOrderInvoiceSelection {
  salesOrderLineId: ID;
  quantity: number;
  /**
   * Phase 5C: when set, this selection bills a specific Delivery Note
   * line's already-departed quantity rather than a fresh direct
   * fulfilment — see `create_invoice_from_sales_order` (migration 0055)
   * and docs/DELIVERY_NOTES_DESIGN.md. Validated against that DN line's
   * OWN remaining-to-invoice quantity by the RPC; `buildInvoiceFromSelections`
   * (the local/test path) does not yet re-validate this — see
   * `deliveryNoteService.createInvoiceFromDeliveryNote()`, which builds
   * these selections directly and calls the RPC path exclusively.
   */
  deliveryNoteLineId?: ID;
}

export interface BuiltInvoicePart {
  salesOrderLineId: ID;
  /** the AUTHORITATIVE Sales Order line — the service derives productId / warehouseId / taxRateId / unitPrice / description from THIS, never from the caller. */
  source: DocumentLineItem;
  quantity: number;
  lineTotal: number;
  taxAmount: number;
}

export interface BuiltInvoiceFromSelections {
  parts: BuiltInvoicePart[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

/** true when `q` is a finite number > 0 with at most `QUANTITY_DECIMALS` decimal places. */
export function isValidSelectionQuantity(q: unknown): q is number {
  if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0) return false;
  return roundQty(q) === q;
}

/**
 * Validate `selections` against the CURRENT invoice evidence (`invoices` — the
 * caller MUST pass a freshly-fetched list) and build the invoice-line data from
 * the authoritative Sales Order lines. Throws a specific `Error` on the first
 * invalid selection. Pure — no id generation, no I/O.
 *
 * Rejects: a cancelled SO; a legacy (pre-5B.1) fully-converted SO; an empty
 * selection; a `salesOrderLineId` not on the order; a duplicated line; a
 * non-finite / non-positive / over-precise quantity; a quantity exceeding that
 * line's CURRENT `remainingToInvoiceQty`.
 *
 * Concurrency: the remaining quantity is re-derived here from `invoices`, so a
 * stale browser selection is caught as long as the caller re-fetched. This is
 * NOT a row-locked atomic check — see docs/KNOWN_ISSUES.md.
 */
export function buildInvoiceFromSelections(
  order: Pick<SalesOrder, 'id' | 'lineItems' | 'status'>,
  invoices: readonly Invoice[],
  selections: readonly SalesOrderInvoiceSelection[],
): BuiltInvoiceFromSelections {
  if (order.status === 'cancelled') {
    throw new Error(`Cannot invoice sales order "${order.id}": it has been cancelled.`);
  }
  if (order.status === 'closed') {
    throw new Error(`Cannot invoice sales order "${order.id}": its remaining quantity has been closed.`);
  }
  if (!Array.isArray(selections) || selections.length === 0) {
    throw new Error('Select at least one line to invoice.');
  }

  const linked = invoices.filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void');
  const legacy = linked.find(
    (inv) => inv.lineItems.length > 0 && inv.lineItems.every((l) => !l.salesOrderLineId),
  );
  if (legacy) {
    throw new Error(
      `Cannot partially invoice sales order "${order.id}": it was already converted to invoice ${legacy.invoiceNumber}.`,
    );
  }

  const fulfilment = computeSalesOrderFulfilment(order, invoices);

  // A stored `fulfilled` order with no line-level evidence is a legacy /
  // seed conversion — there is nothing to invoice against it.
  if (order.status === 'fulfilled' && !fulfilment.hasLineLevelEvidence) {
    throw new Error(`Cannot invoice sales order "${order.id}": it has already been fulfilled.`);
  }

  const remainingByLine = new Map(fulfilment.lines.map((l) => [l.salesOrderLineId, l.remainingToInvoiceQty]));
  const soLineById = new Map(order.lineItems.map((l) => [l.id, l]));

  const seen = new Set<ID>();
  const parts: BuiltInvoicePart[] = [];
  for (const sel of selections) {
    const soLine = soLineById.get(sel.salesOrderLineId);
    if (!soLine) {
      throw new Error(`Line "${sel.salesOrderLineId}" is not on sales order "${order.id}".`);
    }
    if (seen.has(sel.salesOrderLineId)) {
      throw new Error(`Line "${soLine.description || sel.salesOrderLineId}" is selected more than once.`);
    }
    seen.add(sel.salesOrderLineId);

    if (typeof sel.quantity !== 'number' || !Number.isFinite(sel.quantity)) {
      throw new Error(`Quantity for "${soLine.description}" must be a number.`);
    }
    if (sel.quantity <= 0) {
      throw new Error(`Quantity for "${soLine.description}" must be greater than zero.`);
    }
    if (roundQty(sel.quantity) !== sel.quantity) {
      throw new Error(`Quantity for "${soLine.description}" has more than ${QUANTITY_DECIMALS} decimal places.`);
    }

    const remaining = remainingByLine.get(sel.salesOrderLineId) ?? 0;
    if (sel.quantity > remaining + EPSILON) {
      throw new Error(
        `Cannot invoice ${roundQty(sel.quantity)} of "${soLine.description}" — only ${roundQty(remaining)} remain to invoice.`,
      );
    }

    const orderedQty = Math.max(0, roundQty(soLine.quantity ?? 0));
    const isWholeLine = Math.abs(sel.quantity - orderedQty) <= EPSILON;
    // Effective tax rate recovered from the SO line's OWN frozen economics
    // (matches `convertToInvoice`'s behaviour — a partial invoice keeps the
    // rate the order was quoted at; the user edits the draft if VAT changed).
    const rate = (soLine.lineTotal ?? 0) > 0 ? (soLine.taxAmount ?? 0) / (soLine.lineTotal as number) : 0;
    const lineTotal = isWholeLine ? round2(soLine.lineTotal ?? 0) : round2(sel.quantity * (soLine.unitPrice ?? 0));
    const taxAmount = isWholeLine ? round2(soLine.taxAmount ?? 0) : round2(lineTotal * rate);
    parts.push({ salesOrderLineId: sel.salesOrderLineId, source: soLine, quantity: sel.quantity, lineTotal, taxAmount });
  }

  const subtotal = round2(parts.reduce((s, p) => s + p.lineTotal, 0));
  const taxTotal = round2(parts.reduce((s, p) => s + p.taxAmount, 0));
  return { parts, subtotal, taxTotal, total: round2(subtotal + taxTotal) };
}

/**
 * true when "Close remaining" is a valid action for this order: it is a
 * `confirmed` order, some quantity has been **POSTED**-invoiced, and there is
 * still an un-invoiced remainder to abandon. Rationale for requiring *posted*
 * (not merely drafted) progress: closing means "we WON'T supply the rest", so
 * there must be a supplied part it applies against; an order whose whole
 * quantity is still only in a draft should have that draft posted (then
 * closed) or deleted (then `cancelOrder`d) — otherwise a later post of the
 * abandoned draft would contradict the close.
 *
 * A `pending` order, or a `confirmed` order with nothing posted, uses plain
 * cancellation. A fully-invoiced / already-closed / cancelled / `fulfilled`
 * order cannot be closed.
 */
export function canCloseRemaining(
  order: Pick<SalesOrder, 'status'>,
  fulfilment: Pick<SalesOrderFulfilment, 'postedFulfilledQty' | 'remainingToFulfilQty'>,
): boolean {
  return (
    order.status === 'confirmed' &&
    fulfilment.postedFulfilledQty > EPSILON &&
    fulfilment.remainingToFulfilQty > EPSILON
  );
}

/** The "invoice every remaining quantity" selection set — what `convertToInvoice` bills. `[]` when nothing is left. */
export function fullRemainingSelections(
  order: Pick<SalesOrder, 'id' | 'lineItems' | 'status'>,
  invoices: readonly Invoice[],
): SalesOrderInvoiceSelection[] {
  return computeSalesOrderFulfilment(order, invoices)
    .lines.filter((l) => l.remainingToInvoiceQty > EPSILON)
    .map((l) => ({ salesOrderLineId: l.salesOrderLineId, quantity: l.remainingToInvoiceQty }));
}

/** Same legacy tolerance for the fulfilment badge. */
export function displayFulfilmentStatus(
  order: Pick<SalesOrder, 'status'>,
  fulfilment: Pick<SalesOrderFulfilment, 'fulfilmentStatus' | 'hasLineLevelEvidence' | 'legacyLinkedInvoiceIds'>,
): FulfilmentStatus {
  if (
    !fulfilment.hasLineLevelEvidence &&
    fulfilment.legacyLinkedInvoiceIds.length > 0 &&
    order.status === 'fulfilled'
  ) {
    return 'fulfilled';
  }
  return fulfilment.fulfilmentStatus;
}
