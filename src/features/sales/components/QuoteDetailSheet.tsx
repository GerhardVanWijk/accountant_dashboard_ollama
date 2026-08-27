import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Quote, SalesOrder } from '@/types';
import { RecordDetailSheet, RelatedRecordsSection, type RelatedRecordItem } from '@/components/app/record-detail-sheet';
import { RecordAuditHistorySection } from '@/components/app/record-audit-history';
import { RecordLink } from '@/components/app/record-link';
import { StatusBadge } from '@/components/app/status-badge';
import { QuoteDetail } from './QuoteDetail';

export interface QuoteDetailSheetProps {
  quote: Quote | undefined;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  /** Every sales order in the company — filtered internally to the one converted from this quote, if any. */
  salesOrders: SalesOrder[];
  onDelete?: () => void;
  onMarkAsSent?: (id: string) => void;
  onMarkAsAccepted?: (id: string) => void;
  onMarkAsDeclined?: (id: string) => void;
  onConvertToSalesOrder?: (id: string) => void;
  isBusy?: boolean;
}

/** Same reusable pattern as InvoiceDetailSheet — see that file's doc comment. */
export function QuoteDetailSheet({
  quote,
  isLoading,
  open,
  onOpenChange,
  customerName,
  salesOrders,
  onDelete,
  onMarkAsSent,
  onMarkAsAccepted,
  onMarkAsDeclined,
  onConvertToSalesOrder,
  isBusy,
}: QuoteDetailSheetProps) {
  const navigate = useNavigate();

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!quote) return [];
    const items: RelatedRecordItem[] = [{ label: 'Customer', value: <RecordLink onClick={() => navigate('/sales/customers')}>{customerName}</RecordLink> }];
    const convertedOrder = salesOrders.find((o) => o.quoteId === quote.id);
    if (convertedOrder) {
      items.push({ label: 'Sales order', value: <RecordLink onClick={() => navigate('/sales/orders')}>{convertedOrder.orderNumber}</RecordLink> });
    }
    return items;
  }, [quote, customerName, salesOrders, navigate]);

  const state = isLoading ? 'loading' : quote ? 'ready' : 'not-found';

  return (
    <RecordDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={quote?.quoteNumber ?? 'Quote'}
      titleAdornment={quote ? <StatusBadge status={quote.status} /> : undefined}
      state={state}
      notFoundMessage="This quote could not be found — it may have been deleted."
      className="sm:max-w-xl"
    >
      {quote && (
        <div className="flex flex-col gap-6">
          <QuoteDetail
            quote={quote}
            customerName={customerName}
            onDelete={onDelete}
            isBusy={isBusy}
            onMarkAsSent={onMarkAsSent}
            onMarkAsAccepted={onMarkAsAccepted}
            onMarkAsDeclined={onMarkAsDeclined}
            onConvertToSalesOrder={onConvertToSalesOrder}
          />
          <RelatedRecordsSection items={relatedItems} />
          <RecordAuditHistorySection recordType="Quote" recordId={quote.id} />
        </div>
      )}
    </RecordDetailSheet>
  );
}
