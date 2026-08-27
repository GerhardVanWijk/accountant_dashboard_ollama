import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Company, CreditNote, CustomerReceipt } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { useInvoice } from '../hooks/useInvoices';
import { InvoiceDetail } from './InvoiceDetail';

export interface InvoiceDetailSheetProps {
  invoiceId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  company?: Pick<Company, 'name' | 'vatRegistrationNumber' | 'registrationNumber'>;
  /** Every credit note in the company — filtered internally to this invoice's own. */
  creditNotes: CreditNote[];
  /** Every customer receipt in the company — filtered internally to this invoice's own allocations. */
  receipts: CustomerReceipt[];
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkAsSent?: () => void;
  onRecordPayment?: () => void;
  isBusy?: boolean;
}

/**
 * Wraps the existing, unchanged InvoiceDetail (real business-rule-gated
 * actions, real financial content — see its own doc comment) in the shared
 * RecordDetailSheet architecture, adding real FK-backed traceability:
 * Customer, Journal Entry, Credit Notes that reference this invoice
 * (credit_notes.invoice_id, a real FK — see the audit's Supabase
 * relationship findings), Customer Receipts whose allocations reference it
 * (ReceiptAllocation.invoiceId — a JSONB-embedded id, not a queryable FK;
 * filtered here in memory), and audit history.
 *
 * Deliberately does NOT pass onBack to InvoiceDetail — there is no "back"
 * inside a sheet; closing it (the sheet's own X / overlay click) is the
 * equivalent action, and the underlying invoice list stays mounted behind
 * it the whole time (see InvoicesPage).
 *
 * Related-record links navigate to the target module's own list page
 * (Customers/Journal Entries/Credit Notes/Customer Receipts) rather than
 * opening a further nested sheet — a real, working traceability jump; a
 * full nested-sheet chain for every hop is a larger follow-on, not
 * attempted in this pass (see the audit report).
 */
export function InvoiceDetailSheet({
  invoiceId,
  open,
  onOpenChange,
  customerName,
  company,
  creditNotes,
  receipts,
  onEdit,
  onDelete,
  onMarkAsSent,
  onRecordPayment,
  isBusy,
}: InvoiceDetailSheetProps) {
  const { invoice, loading, error } = useInvoice(invoiceId);
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!invoice) return [];
    const items: RelatedRecordItem[] = [
      {
        label: 'Customer',
        value: (
          <RecordLink onClick={() => navigate('/sales/customers')}>{customerName}</RecordLink>
        ),
      },
    ];

    if (invoice.journalEntryId) {
      items.push({
        label: 'GL posting',
        value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${invoice.journalEntryId}`)}>View journal entry</RecordLink>,
      });
    }

    const relatedCreditNotes = creditNotes.filter((cn) => cn.invoiceId === invoice.id);
    for (const cn of relatedCreditNotes) {
      items.push({
        label: 'Credit note',
        value: <RecordLink onClick={() => navigate('/sales/credit-notes')}>{cn.creditNoteNumber}</RecordLink>,
      });
    }

    const relatedReceipts = receipts.filter((r) => r.allocations.some((a) => a.invoiceId === invoice.id));
    for (const receipt of relatedReceipts) {
      const allocated = receipt.allocations.find((a) => a.invoiceId === invoice.id)?.amount ?? 0;
      items.push({
        label: 'Receipt',
        value: (
          <RecordLink onClick={() => navigate('/sales/receipts')}>
            {receipt.receiptNumber} (R{allocated.toFixed(2)})
          </RecordLink>
        ),
      });
    }

    return items;
  }, [invoice, customerName, creditNotes, receipts, navigate]);

  const state = loading ? 'loading' : error ? 'error' : !invoice ? 'not-found' : 'ready';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={invoice?.invoiceNumber ?? 'Invoice'}
      titleAdornment={invoice ? <StatusBadge status={invoice.status} /> : undefined}
      state={state}
      errorMessage={error ?? undefined}
      notFoundMessage="This invoice could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {invoice && (
        <div className="flex flex-col gap-6">
          <InvoiceDetail
            invoice={invoice}
            customerName={customerName}
            company={company}
            onEdit={onEdit}
            onDelete={onDelete}
            onMarkAsSent={onMarkAsSent}
            onRecordPayment={onRecordPayment}
            isBusy={isBusy}
          />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="Invoice" recordId={invoice.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
