import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Bill, PurchaseOrder } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { PurchaseOrderDetail } from './PurchaseOrderDetail';

export interface PurchaseOrderDetailSheetProps {
  purchaseOrder: PurchaseOrder | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierName: string;
  suppliersMap?: Record<string, string>;
  bills: Bill[];
  onSend?: (id: string) => void;
  onRecordReceipt?: (id: string) => void;
  onCancel?: (id: string) => void;
  onConvertToBill?: (id: string) => void;
  isBusy?: boolean;
}

export function PurchaseOrderDetailSheet({
  purchaseOrder,
  isLoading,
  open,
  onOpenChange,
  supplierName,
  suppliersMap,
  bills,
  onSend,
  onRecordReceipt,
  onCancel,
  onConvertToBill,
  isBusy,
}: PurchaseOrderDetailSheetProps) {
  const navigate = useNavigate();

  const convertedBill = purchaseOrder?.billId ? bills.find((b) => b.id === purchaseOrder.billId) : undefined;

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!purchaseOrder) return [];
    const items: RelatedRecordItem[] = [{ label: 'Supplier', value: <RecordLink onClick={() => navigate('/purchases/vendors')}>{supplierName}</RecordLink> }];
    if (convertedBill) items.push({ label: 'Bill', value: <RecordLink onClick={() => navigate('/purchases/bills')}>{convertedBill.billNumber}</RecordLink> });
    if (purchaseOrder.journalEntryId) items.push({ label: 'GL posting (goods received)', value: <RecordLink onClick={() => navigate(`/accounting/journals?record=${purchaseOrder.journalEntryId}`)}>View journal entry</RecordLink> });
    return items;
  }, [purchaseOrder, supplierName, convertedBill, navigate]);

  const state = isLoading ? 'loading' : purchaseOrder ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={purchaseOrder?.poNumber ?? 'Purchase order'}
      titleAdornment={purchaseOrder ? <StatusBadge status={purchaseOrder.status} /> : undefined}
      state={state}
      notFoundMessage="This purchase order could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {purchaseOrder && (
        <div className="flex flex-col gap-6">
          <PurchaseOrderDetail
            purchaseOrder={purchaseOrder}
            suppliersMap={suppliersMap}
            onSend={onSend}
            onRecordReceipt={onRecordReceipt}
            onCancel={onCancel}
            onConvertToBill={onConvertToBill}
            isBusy={isBusy}
          />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="PurchaseOrder" recordId={purchaseOrder.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
