import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Invoice, Quote, SalesOrder } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { SalesOrderDetail } from './SalesOrderDetail';

export interface SalesOrderDetailSheetProps {
  salesOrder: SalesOrder | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  quotes: Quote[];
  invoices: Invoice[];
  onDelete?: () => void;
  onConfirmOrder?: (id: string) => void;
  onCancelOrder?: (id: string) => void;
  onConvertToInvoice?: (id: string) => void;
  isBusy?: boolean;
}

export function SalesOrderDetailSheet({
  salesOrder,
  isLoading,
  open,
  onOpenChange,
  customerName,
  quotes,
  invoices,
  onDelete,
  onConfirmOrder,
  onCancelOrder,
  onConvertToInvoice,
  isBusy,
}: SalesOrderDetailSheetProps) {
  const navigate = useNavigate();

  const sourceQuote = salesOrder?.quoteId ? quotes.find((q) => q.id === salesOrder.quoteId) : undefined;
  const convertedInvoice = salesOrder ? invoices.find((inv) => inv.salesOrderId === salesOrder.id) : undefined;

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!salesOrder) return [];
    const items: RelatedRecordItem[] = [{ label: 'Customer', value: <RecordLink onClick={() => navigate('/sales/customers')}>{customerName}</RecordLink> }];
    if (sourceQuote) items.push({ label: 'Source quote', value: <RecordLink onClick={() => navigate('/sales/quotes')}>{sourceQuote.quoteNumber}</RecordLink> });
    if (convertedInvoice) items.push({ label: 'Invoice', value: <RecordLink onClick={() => navigate('/sales/invoices')}>{convertedInvoice.invoiceNumber}</RecordLink> });
    return items;
  }, [salesOrder, customerName, sourceQuote, convertedInvoice, navigate]);

  const state = isLoading ? 'loading' : salesOrder ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={salesOrder?.orderNumber ?? 'Sales order'}
      titleAdornment={salesOrder ? <StatusBadge status={salesOrder.status} /> : undefined}
      state={state}
      notFoundMessage="This sales order could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {salesOrder && (
        <div className="flex flex-col gap-6">
          <SalesOrderDetail
            salesOrder={salesOrder}
            customerName={customerName}
            quoteNumber={sourceQuote?.quoteNumber}
            onDelete={onDelete}
            isBusy={isBusy}
            onConfirmOrder={onConfirmOrder}
            onCancelOrder={onCancelOrder}
            onConvertToInvoice={onConvertToInvoice}
          />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="SalesOrder" recordId={salesOrder.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
