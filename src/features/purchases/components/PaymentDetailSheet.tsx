import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Payment } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { PaymentDetail } from './PaymentDetail';

export interface PaymentDetailSheetProps {
  payment: Payment | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierName: string;
  billNumbers: Map<string, string>;
}

export function PaymentDetailSheet({ payment, isLoading, open, onOpenChange, supplierName, billNumbers }: PaymentDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!payment) return [];
    const items: RelatedRecordItem[] = [{ label: 'Supplier', value: <RecordLink onClick={() => navigate('/purchases/vendors')}>{supplierName}</RecordLink> }];
    for (const allocation of payment.allocations) {
      const billNumber = billNumbers.get(allocation.billId);
      if (!billNumber) continue;
      items.push({
        label: 'Applied to bill',
        value: (
          <RecordLink onClick={() => navigate('/purchases/bills')}>
            {billNumber} (R{allocation.amount.toFixed(2)})
          </RecordLink>
        ),
      });
    }
    if (payment.journalEntryId) items.push({ label: 'GL posting', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${payment.journalEntryId}`)}>View journal entry</RecordLink> });
    if (payment.bankAccountId) items.push({ label: 'Bank account', value: <RecordLink onClick={() => navigate('/banking/accounts')}>View bank account</RecordLink> });
    return items;
  }, [payment, supplierName, billNumbers, navigate]);

  const state = isLoading ? 'loading' : payment ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={payment?.paymentNumber ?? 'Payment'}
      state={state}
      notFoundMessage="This payment could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {payment && (
        <div className="flex flex-col gap-6">
          <PaymentDetail payment={payment} supplierName={supplierName} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="Payment" recordId={payment.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
