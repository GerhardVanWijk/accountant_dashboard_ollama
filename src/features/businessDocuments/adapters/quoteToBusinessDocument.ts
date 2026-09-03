import type { Quote } from '@/types';
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
 * Quote → printable view model. A quote never posts to the GL; the adapter
 * only reads the stored subtotal / taxTotal / total.
 */
export function quoteToBusinessDocument(
  quote: Quote,
  ctx: AdapterContext,
): BusinessDocumentViewModel {
  if (!ctx.customer) throw new Error('quoteToBusinessDocument: customer is required');

  const meta = [metaField('Customer account', ctx.customer.customerNumber)].filter(
    (f): f is BusinessDocumentMetaField => Boolean(f),
  );

  const { columns, lines } = mapLines(quote.lineItems, ctx);

  return {
    kind: 'quote',
    title: 'QUOTE',
    documentNumber: quote.quoteNumber,
    issuedOnLabel: 'Date',
    issuedOn: formatDate(quote.issueDate),
    secondaryDateLabel: 'Valid until',
    secondaryDate: formatDate(quote.expiryDate),
    issuer: issuerParty(ctx.company),
    recipient: customerParty(ctx.customer),
    recipientHeading: 'Prepared for',
    meta,
    columns,
    lines,
    totals: [
      { label: 'Subtotal', value: formatCurrency(quote.subtotal) },
      { label: 'VAT', value: formatCurrency(quote.taxTotal) },
      { label: 'Total', value: formatCurrency(quote.total), emphasis: true },
    ],
    notes: quote.notes || undefined,
    terms: resolveDocumentTerms(undefined, ctx.company),
    branding: branding(ctx.company, ctx.now),
    isTaxDocument: ctx.company.isVatRegistered,
  };
}
