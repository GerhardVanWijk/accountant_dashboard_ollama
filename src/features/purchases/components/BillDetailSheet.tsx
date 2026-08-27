import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Bill, Payment, PurchaseOrder } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { BillDetail } from './BillDetail';

export interface BillDetailSheetProps {
  bill: Bill | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierName: string;
  suppliersMap?: Record<string, string>;
  purchaseOrders: PurchaseOrder[];
  payments: Payment[];
  onPost?: (id: string) => void;
  onRecordPayment?: () => void;
}

export function BillDetailSheet({ bill, isLoading, open, onOpenChange, supplierName, suppliersMap, purchaseOrders, payments, onPost, onRecordPayment }: BillDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!bill) return [];
    const items: RelatedRecordItem[] = [{ label: 'Supplier', value: <RecordLink onClick={() => navigate('/purchases/vendors')}>{supplierName}</RecordLink> }];
    const sourcePo = bill.purchaseOrderId ? purchaseOrders.find((po) => po.id === bill.purchaseOrderId) : undefined;
    if (sourcePo) items.push({ label: 'Source purchase order', value: <RecordLink onClick={() => navigate('/purchases/orders')}>{sourcePo.poNumber}</RecordLink> });
    if (bill.journalEntryId) items.push({ label: 'GL posting', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${bill.journalEntryId}`)}>View journal entry</RecordLink> });
    for (const payment of payments) {
      const allocated = payment.allocations.find((a) => a.billId === bill.id);
      if (!allocated) continue;
      items.push({
        label: 'Paid via',
        value: (
          <RecordLink onClick={() => navigate('/purchases/payments')}>
            {payment.paymentNumber} (R{allocated.amount.toFixed(2)})
          </RecordLink>
        ),
      });
    }
    return items;
  }, [bill, supplierName, purchaseOrders, payments, navigate]);

  const state = isLoading ? 'loading' : bill ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bill?.billNumber ?? 'Bill'}
      titleAdornment={bill ? <StatusBadge status={bill.status} /> : undefined}
      state={state}
      notFoundMessage="This bill could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {bill && (
        <div className="flex flex-col gap-6">
          <BillDetail bill={bill} suppliersMap={suppliersMap} onPost={onPost} onRecordPayment={onRecordPayment} />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="Bill" recordId={bill.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
