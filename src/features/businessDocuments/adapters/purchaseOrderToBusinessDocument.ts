import type { PurchaseOrder } from '@/types';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { BusinessDocumentMetaField, BusinessDocumentViewModel } from '../types';
import {
  type AdapterContext,
  branding,
  issuerParty,
  mapLines,
  metaField,
  resolveDocumentTerms,
  supplierParty,
} from './shared';

/**
 * Purchase order → printable view model. A PO never posts to the GL. It is
 * not a tax document (the issuer is the buyer, not claiming VAT here) —
 * `isTaxDocument` is always false and the issuer's income-tax number is
 * not shown.
 */
export function purchaseOrderToBusinessDocument(
  po: PurchaseOrder,
  ctx: AdapterContext,
): BusinessDocumentViewModel {
  if (!ctx.supplier) throw new Error('purchaseOrderToBusinessDocument: supplier is required');

  const meta = [metaField('Supplier account', ctx.supplier.supplierNumber)].filter(
    (f): f is BusinessDocumentMetaField => Boolean(f),
  );

  const { columns, lines } = mapLines(po.lineItems, ctx);

  return {
    kind: 'purchase_order',
    title: 'PURCHASE ORDER',
    documentNumber: po.poNumber,
    issuedOnLabel: 'Order date',
    issuedOn: formatDate(po.orderDate),
    secondaryDateLabel: po.expectedDate ? 'Expected delivery' : undefined,
    secondaryDate: po.expectedDate ? formatDate(po.expectedDate) : undefined,
    issuer: issuerParty(ctx.company),
    recipient: supplierParty(ctx.supplier),
    recipientHeading: 'Supplier',
    meta,
    columns,
    lines,
    totals: [
      { label: 'Subtotal', value: formatCurrency(po.subtotal) },
      { label: 'VAT', value: formatCurrency(po.taxTotal) },
      { label: 'Total', value: formatCurrency(po.total), emphasis: true },
    ],
    notes: po.notes || undefined,
    terms: resolveDocumentTerms(undefined, ctx.company),
    branding: branding(ctx.company, ctx.now),
    isTaxDocument: false,
  };
}
