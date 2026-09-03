import type { Invoice } from '@/types';
import { formatCurrency, formatDate } from '@/lib/app/format';
import type {
  BusinessDocumentMetaField,
  BusinessDocumentTotalRow,
  BusinessDocumentViewModel,
} from '../types';
import {
  type AdapterContext,
  branding,
  customerParty,
  issuerParty,
  mapLines,
  metaField,
  paymentInfoFor,
  resolveDocumentTerms,
} from './shared';

/**
 * Invoice → printable view model. Consumes the stored
 * subtotal / taxTotal / total / amountPaid — nothing is recomputed. A
 * VAT-registered issuer produces a "TAX INVOICE"; otherwise a plain
 * "INVOICE".
 */
export function invoiceToBusinessDocument(
  invoice: Invoice,
  ctx: AdapterContext,
): BusinessDocumentViewModel {
  if (!ctx.customer) throw new Error('invoiceToBusinessDocument: customer is required');

  const isTax = ctx.company.isVatRegistered;

  const meta = [
    metaField('Customer account', ctx.customer.customerNumber),
    metaField('Payment terms', ctx.customer.paymentTerms),
    metaField('Sales order reference', ctx.salesOrderNumber),
  ].filter((f): f is BusinessDocumentMetaField => Boolean(f));

  const { columns, lines } = mapLines(invoice.lineItems, ctx);

  const totals: BusinessDocumentTotalRow[] = [
    { label: 'Subtotal', value: formatCurrency(invoice.subtotal) },
    { label: 'VAT', value: formatCurrency(invoice.taxTotal) },
    { label: 'Total', value: formatCurrency(invoice.total), emphasis: true },
  ];
  if (invoice.amountPaid > 0) {
    totals.push({ label: 'Amount paid', value: formatCurrency(invoice.amountPaid) });
    totals.push({
      label: 'Balance due',
      value: formatCurrency(invoice.total - invoice.amountPaid),
    });
  }

  return {
    kind: isTax ? 'tax_invoice' : 'invoice',
    title: isTax ? 'TAX INVOICE' : 'INVOICE',
    documentNumber: invoice.invoiceNumber,
    issuedOnLabel: 'Invoice date',
    issuedOn: formatDate(invoice.issueDate),
    secondaryDateLabel: 'Due date',
    secondaryDate: formatDate(invoice.dueDate),
    issuer: issuerParty(ctx.company, { includeIncomeTaxNumber: true }),
    recipient: customerParty(ctx.customer),
    recipientHeading: 'Bill to',
    meta,
    columns,
    lines,
    totals,
    notes: invoice.notes || undefined,
    terms: resolveDocumentTerms(undefined, ctx.company),
    paymentInfo: ctx.bankAccount
      ? paymentInfoFor(ctx.bankAccount, ctx.company, invoice.invoiceNumber)
      : undefined,
    branding: branding(ctx.company, ctx.now),
    isTaxDocument: isTax,
  };
}
