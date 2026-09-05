import type { Company, Customer, DeliveryNote, Product, Warehouse } from '@/types';
import { formatDate } from '@/lib/app/format';
import type { BusinessDocumentLine, BusinessDocumentLineColumn, BusinessDocumentMetaField, BusinessDocumentViewModel } from '../types';
import { branding, customerParty, formatQuantity, issuerParty, metaField, resolveDocumentTerms } from './shared';

/**
 * Delivery Note → printable view model (Phase 5C, docs/DELIVERY_NOTES_DESIGN.md
 * Part 21). Deliberately price-suppressed: a Delivery Note is evidence of
 * goods physically dispatched, not a tax invoice — `unitPrice`/`vat`/
 * `amount` columns are OMITTED from the printed document even though the
 * underlying `DeliveryNoteLineItem` stores them (for invoice-derivation
 * only). No journal/accounting/internal-id information is exposed —
 * `BusinessDocumentViewModel` is the same id-free privacy boundary every
 * other document uses (`noInternalIds.test.tsx` covers this file too).
 */
export function deliveryNoteToBusinessDocument(
  deliveryNote: DeliveryNote,
  ctx: {
    company: Company;
    customer: Customer;
    warehouse?: Warehouse;
    products: Map<string, Product>;
    salesOrderNumber?: string;
    now?: Date;
  },
): BusinessDocumentViewModel {
  const meta = [
    metaField('Sales order', ctx.salesOrderNumber),
    metaField('Warehouse', ctx.warehouse?.name),
  ].filter((f): f is BusinessDocumentMetaField => Boolean(f));

  const hasCode = deliveryNote.lineItems.some((l) => ctx.products.get(l.productId)?.sku);
  const hasUnit = deliveryNote.lineItems.some((l) => ctx.products.get(l.productId)?.uom);
  const columns: BusinessDocumentLineColumn[] = [];
  if (hasCode) columns.push('code');
  columns.push('description', 'quantity');
  if (hasUnit) columns.push('unit');

  const lines: BusinessDocumentLine[] = deliveryNote.lineItems.map((l) => {
    const product = ctx.products.get(l.productId);
    return {
      description: l.description,
      code: product?.sku || undefined,
      quantity: formatQuantity(l.quantity),
      unit: product?.uom || undefined,
      // Deliberately blank — never rendered (columns omits unitPrice/vat/amount above).
      unitPrice: '',
      amount: '',
    };
  });

  return {
    kind: 'delivery_note',
    title: 'DELIVERY NOTE',
    documentNumber: deliveryNote.deliveryNoteNumber,
    issuedOnLabel: 'Delivery date',
    issuedOn: formatDate(deliveryNote.deliveryDate),
    issuer: issuerParty(ctx.company),
    issuerHeading: 'From',
    recipient: customerParty(ctx.customer),
    recipientHeading: 'Deliver to',
    meta,
    columns,
    lines,
    // No priced totals — a Delivery Note carries no revenue/VAT/AR figure.
    totals: [],
    notes: deliveryNote.notes || undefined,
    terms: resolveDocumentTerms(undefined, ctx.company),
    branding: branding(ctx.company, ctx.now),
    isTaxDocument: false,
  };
}
