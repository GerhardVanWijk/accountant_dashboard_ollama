import type { Company, Customer, Product, ReturnNote, Warehouse } from '@/types';
import { formatDate } from '@/lib/app/format';
import type { BusinessDocumentLine, BusinessDocumentLineColumn, BusinessDocumentMetaField, BusinessDocumentViewModel } from '../types';
import { branding, customerParty, formatQuantity, issuerParty, metaField, resolveDocumentTerms } from './shared';

/**
 * Return Note → printable view model (Phase 5D). Price-suppressed, same
 * reasoning as `deliveryNoteToBusinessDocument`: this is evidence of goods
 * physically returned, not a credit/tax document — `unitPrice`/`vat`/
 * `amount` columns are OMITTED even though the underlying
 * `ReturnNoteLineItem` stores them (for accounting-preview use only). No
 * journal/accounting/internal-id information is exposed —
 * `BusinessDocumentViewModel` is the same id-free privacy boundary every
 * other document uses (`noInternalIds.test.tsx` covers this file too).
 */
export function returnNoteToBusinessDocument(
  returnNote: ReturnNote,
  ctx: {
    company: Company;
    customer: Customer;
    warehouse?: Warehouse;
    products: Map<string, Product>;
    deliveryNoteNumber?: string;
    now?: Date;
  },
): BusinessDocumentViewModel {
  const meta = [
    metaField('Delivery note', ctx.deliveryNoteNumber),
    metaField('Warehouse', ctx.warehouse?.name),
  ].filter((f): f is BusinessDocumentMetaField => Boolean(f));

  const hasCode = returnNote.lineItems.some((l) => ctx.products.get(l.productId)?.sku);
  const hasUnit = returnNote.lineItems.some((l) => ctx.products.get(l.productId)?.uom);
  const columns: BusinessDocumentLineColumn[] = [];
  if (hasCode) columns.push('code');
  columns.push('description', 'quantity');
  if (hasUnit) columns.push('unit');

  const lines: BusinessDocumentLine[] = returnNote.lineItems.map((l) => {
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
    kind: 'return_note',
    title: 'RETURN NOTE',
    documentNumber: returnNote.returnNoteNumber,
    issuedOnLabel: 'Return date',
    issuedOn: formatDate(returnNote.returnDate),
    issuer: issuerParty(ctx.company),
    issuerHeading: 'From',
    recipient: customerParty(ctx.customer),
    recipientHeading: 'Returned by',
    meta,
    columns,
    lines,
    // No priced totals — a Return Note carries no revenue/VAT/refund figure.
    totals: [],
    notes: returnNote.notes || undefined,
    terms: resolveDocumentTerms(undefined, ctx.company),
    branding: branding(ctx.company, ctx.now),
    isTaxDocument: false,
  };
}
