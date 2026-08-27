import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Company, CreditNote } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { CreditNoteDetail } from './CreditNoteDetail';

export interface CreditNoteDetailSheetProps {
  creditNote: CreditNote | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  linkedInvoiceNumber?: string;
  company?: Pick<Company, 'name' | 'vatRegistrationNumber' | 'registrationNumber'>;
  onIssue?: (id: string) => void;
  onVoid?: (id: string) => void;
  onAllocate?: () => void;
  isBusy?: boolean;
}

/** credit_notes.invoice_id is a real FK (confirmed live in the Supabase audit) — the invoice link here is DB-backed, not a JSONB scan. */
export function CreditNoteDetailSheet({
  creditNote,
  isLoading,
  open,
  onOpenChange,
  customerName,
  linkedInvoiceNumber,
  company,
  onIssue,
  onVoid,
  onAllocate,
  isBusy,
}: CreditNoteDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!creditNote) return [];
    const items: RelatedRecordItem[] = [{ label: 'Customer', value: <RecordLink onClick={() => navigate('/sales/customers')}>{customerName}</RecordLink> }];
    if (linkedInvoiceNumber) items.push({ label: 'Applied to invoice', value: <RecordLink onClick={() => navigate('/sales/invoices')}>{linkedInvoiceNumber}</RecordLink> });
    if (creditNote.journalEntryId) items.push({ label: 'GL posting', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${creditNote.journalEntryId}`)}>View journal entry</RecordLink> });
    return items;
  }, [creditNote, customerName, linkedInvoiceNumber, navigate]);

  const state = isLoading ? 'loading' : creditNote ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={creditNote?.creditNoteNumber ?? 'Credit note'}
      titleAdornment={creditNote ? <StatusBadge status={creditNote.status} /> : undefined}
      state={state}
      notFoundMessage="This credit note could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {creditNote && (
        <div className="flex flex-col gap-6">
          <CreditNoteDetail
            creditNote={creditNote}
            customerName={customerName}
            linkedInvoiceNumber={linkedInvoiceNumber}
            company={company}
            isBusy={isBusy}
            onIssue={onIssue}
            onVoid={onVoid}
            onAllocate={onAllocate}
          />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="CreditNote" recordId={creditNote.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
