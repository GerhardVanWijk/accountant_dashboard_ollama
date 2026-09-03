import type { CreditNote, CreditNoteReason } from '@/types';
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

const REASON_LABELS: Record<CreditNoteReason, string> = {
  return: 'Returned goods',
  pricing_error: 'Pricing error',
  discount: 'Discount',
  other: 'Other',
};

/**
 * Credit note → printable view model. Totals are labelled as a credit; the
 * template flags the document visually. `originalInvoiceLineId` and the
 * allocation array are never exposed — only the resolved human invoice
 * number, passed in via `ctx.originalInvoiceNumber`.
 */
export function creditNoteToBusinessDocument(
  creditNote: CreditNote,
  ctx: AdapterContext,
): BusinessDocumentViewModel {
  if (!ctx.customer) throw new Error('creditNoteToBusinessDocument: customer is required');

  const reasonLabel = REASON_LABELS[creditNote.reason] ?? creditNote.reason;
  const reasonValue =
    creditNote.reason === 'other' && creditNote.reasonDetails
      ? `${reasonLabel} — ${creditNote.reasonDetails}`
      : reasonLabel;

  const meta = [
    metaField('Against invoice', ctx.originalInvoiceNumber),
    metaField('Reason', reasonValue),
  ].filter((f): f is BusinessDocumentMetaField => Boolean(f));

  const { columns, lines } = mapLines(creditNote.lineItems, ctx);

  return {
    kind: 'credit_note',
    title: 'CREDIT NOTE',
    documentNumber: creditNote.creditNoteNumber,
    issuedOnLabel: 'Date',
    issuedOn: formatDate(creditNote.issueDate),
    issuer: issuerParty(ctx.company, { includeIncomeTaxNumber: true }),
    issuerHeading: 'From',
    recipient: customerParty(ctx.customer),
    recipientHeading: 'Credit to',
    meta,
    columns,
    lines,
    totals: [
      { label: 'Subtotal credited', value: formatCurrency(creditNote.subtotal) },
      { label: 'VAT credited', value: formatCurrency(creditNote.taxTotal) },
      { label: 'Total credit', value: formatCurrency(creditNote.total), emphasis: true },
    ],
    notes: creditNote.notes || undefined,
    terms: resolveDocumentTerms(undefined, ctx.company),
    branding: branding(ctx.company, ctx.now),
    isTaxDocument: ctx.company.isVatRegistered,
  };
}
