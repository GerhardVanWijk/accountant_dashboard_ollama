import type { SalesOrder } from '@/types';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type { BusinessDocumentMetaField, BusinessDocumentViewModel } from '../types';
import {
  type AdapterContext,
  branding,
  customerParty,
  issuerParty,
  mapLines,
  metaField,
  resolveDocumentTerms,
} from './shared';

/**
 * Sales order → printable view model. A sales order never posts to the GL.
 * There is no delivery address, customer-PO reference or expected-delivery
 * field on `SalesOrder` today — only what exists is rendered.
 */
export function salesOrderToBusinessDocument(
  order: SalesOrder,
  ctx: AdapterContext,
): BusinessDocumentViewModel {
  if (!ctx.customer) throw new Error('salesOrderToBusinessDocument: customer is required');

  const meta = [metaField('Quote reference', ctx.quoteNumber)].filter(
    (f): f is BusinessDocumentMetaField => Boolean(f),
  );

  const { columns, lines } = mapLines(order.lineItems, ctx);

  return {
    kind: 'sales_order',
    title: 'SALES ORDER',
    documentNumber: order.orderNumber,
    issuedOnLabel: 'Order date',
    issuedOn: formatDate(order.orderDate),
    issuer: issuerParty(ctx.company),
    issuerHeading: 'From',
    recipient: customerParty(ctx.customer),
    recipientHeading: 'Bill to',
    meta,
    columns,
    lines,
    totals: [
      { label: 'Subtotal', value: formatCurrency(order.subtotal) },
      { label: 'VAT', value: formatCurrency(order.taxTotal) },
      { label: 'Total', value: formatCurrency(order.total), emphasis: true },
    ],
    notes: order.notes || undefined,
    terms: resolveDocumentTerms(undefined, ctx.company),
    branding: branding(ctx.company, ctx.now),
    isTaxDocument: ctx.company.isVatRegistered,
  };
}
