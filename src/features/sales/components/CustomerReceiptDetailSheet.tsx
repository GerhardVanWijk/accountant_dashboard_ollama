import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CustomerReceipt } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { CustomerReceiptDetail } from './CustomerReceiptDetail';

export interface CustomerReceiptDetailSheetProps {
  receipt: CustomerReceipt | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  invoiceNumbers: Map<string, string>;
  onAllocate?: () => void;
  isBusy?: boolean;
}

/**
 * ReceiptAllocation.invoiceId is a JSONB-embedded id, not a queryable FK
 * (see the Supabase audit's findings) — the invoice links below are
 * resolved from the caller-supplied invoiceNumbers map, exactly as
 * CustomerReceiptDetail's own allocation history already did before this
 * pass; the only change here is making each one a RecordLink.
 */
export function CustomerReceiptDetailSheet({ receipt, isLoading, open, onOpenChange, customerName, invoiceNumbers, onAllocate, isBusy }: CustomerReceiptDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!receipt) return [];
    const items: RelatedRecordItem[] = [{ label: 'Customer', value: <RecordLink onClick={() => navigate('/sales/customers')}>{customerName}</RecordLink> }];
    for (const allocation of receipt.allocations) {
      const invoiceNumber = invoiceNumbers.get(allocation.invoiceId);
      if (!invoiceNumber) continue;
      items.push({
        label: 'Applied to invoice',
        value: (
          <RecordLink onClick={() => navigate('/sales/invoices')}>
            {invoiceNumber} (R{allocation.amount.toFixed(2)})
          </RecordLink>
        ),
      });
    }
    if (receipt.journalEntryId) items.push({ label: 'GL posting', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${receipt.journalEntryId}`)}>View journal entry</RecordLink> });
    if (receipt.bankAccountId) items.push({ label: 'Bank account', value: <RecordLink onClick={() => navigate('/banking/accounts')}>View bank account</RecordLink> });
    return items;
  }, [receipt, customerName, invoiceNumbers, navigate]);

  const state = isLoading ? 'loading' : receipt ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={receipt?.receiptNumber ?? 'Receipt'}
      state={state}
      notFoundMessage="This receipt could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {receipt && (
        <div className="flex flex-col gap-6">
          <CustomerReceiptDetail receipt={receipt} customerName={customerName} invoiceNumbers={invoiceNumbers} onAllocate={onAllocate} isBusy={isBusy} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="CustomerReceipt" recordId={receipt.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
