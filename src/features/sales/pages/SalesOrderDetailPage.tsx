import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import type { SalesOrder } from '@/types';
import {
  DocumentLineTable,
  RecordActionBar,
  RecordActivitySection,
  RecordField,
  RecordPageHeader,
  RecordPageSection,
  RecordPageShell,
  RecordSummaryGrid,
  RelatedRecordsSection,
  type DocumentLineColumn,
  type RelatedRecordItem,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useSalesOrderMutations } from '@/features/sales/hooks/useSalesOrderMutations';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';

type Line = SalesOrder['lineItems'][number];

const LINE_COLUMNS: DocumentLineColumn<Line>[] = [
  { key: 'description', header: 'Description', cell: (l) => l.description },
  { key: 'qty', header: 'Qty', align: 'right', cell: (l) => l.quantity.toFixed(2) },
  { key: 'unit', header: 'Unit price', align: 'right', cell: (l) => formatCurrency(l.unitPrice) },
  { key: 'tax', header: 'Tax', align: 'right', cell: (l) => formatCurrency(l.taxAmount) },
  { key: 'total', header: 'Total', align: 'right', cell: (l) => formatCurrency(l.lineTotal) },
];

/**
 * Full-page Sales Order detail — route `/sales/orders/:orderId`. Replaces
 * the cramped right-hand RecordDetailSheet: the order number never
 * character-wraps, the customer name gets room, line items use the real
 * page width, related records and audit history get their own sections,
 * and the action hierarchy is explicit (Convert to invoice = primary).
 * No accounting behaviour changes — the same
 * SalesOrderService.convertToInvoice()/confirmOrder()/cancelOrder()/
 * deleteSalesOrder() calls as before.
 */
export function SalesOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const { salesOrders, isLoading, error, refetch } = useSalesOrders();
  const order = salesOrders.find((o) => o.id === orderId);
  const { customers: customerMap } = useCustomerMap();
  const { quotes } = useQuotes();
  const { invoices } = useInvoices();

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { deleteSalesOrder, confirmOrder, cancelOrder, convertToInvoice, isLoading: isBusy } = useSalesOrderMutations({
    onSuccess: () => refetch(),
  });

  const customerName = order ? customerMap.get(order.customerId) || 'Unknown customer' : '';
  const sourceQuote = order?.quoteId ? quotes.find((q) => q.id === order.quoteId) : undefined;
  const convertedInvoice = order ? invoices.find((inv) => inv.salesOrderId === order.id) : undefined;

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!order) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    if (sourceQuote) {
      items.push({ label: 'Source quote', value: <Link className="font-medium text-brand hover:underline" to="/sales/quotes">{sourceQuote.quoteNumber}</Link> });
    }
    if (convertedInvoice) {
      items.push({
        label: 'Converted to invoice',
        value: <Link className="font-medium text-brand hover:underline" to={`/sales/invoices/${convertedInvoice.id}`}>{convertedInvoice.invoiceNumber}</Link>,
      });
    }
    return items;
  }, [order, customerName, sourceQuote, convertedInvoice]);

  async function act(fn: () => Promise<unknown>, after: () => void) {
    setActionError(null);
    try {
      await fn();
      after();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this sales order.');
    }
  }

  const state = isLoading ? 'loading' : error ? 'error' : order ? 'ready' : 'not-found';

  const canConfirm = order?.status === 'pending';
  const canCancel = order != null && order.status !== 'fulfilled' && order.status !== 'cancelled';
  const canConvert = order != null && order.status !== 'cancelled' && order.status !== 'fulfilled';
  const canDelete = order?.status === 'pending';

  return (
    <RecordPageShell
      breadcrumbs={[
        { label: 'Sales' },
        { label: 'Sales orders', to: '/sales/orders' },
        { label: order?.orderNumber ?? 'Sales order' },
      ]}
      backTo="/sales/orders"
      backLabel="Sales orders"
      state={state}
      notFoundMessage="This sales order could not be found — it may have been deleted."
    >
      {order && (
        <>
          <RecordPageHeader
            recordNumber={order.orderNumber}
            title={customerName}
            meta={`Order date ${formatDate(order.orderDate)}${sourceQuote ? ` · from quote ${sourceQuote.quoteNumber}` : ''}`}
            status={<StatusBadge status={order.status} />}
            actions={
              <RecordActionBar
                busy={isBusy}
                primary={
                  canConvert
                    ? {
                        label: 'Convert to invoice',
                        onClick: () =>
                          void act(
                            () => convertToInvoice(order.id).then((inv) => { if (inv?.id) navigate(`/sales/invoices/${inv.id}`); }),
                            () => {},
                          ),
                      }
                    : undefined
                }
                secondary={canConfirm ? [{ label: 'Confirm order', onClick: () => void act(() => confirmOrder(order.id), () => {}) }] : []}
                danger={[
                  ...(canCancel ? [{ label: 'Cancel order', onClick: () => void act(() => cancelOrder(order.id), () => {}) }] : []),
                  ...(canDelete ? [{ label: 'Delete draft', onClick: () => setConfirmDelete(true) }] : []),
                ]}
              />
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <RecordPageSection title="Overview">
            <RecordSummaryGrid>
              <RecordField label="Customer" value={customerName} />
              <RecordField label="Order date" value={formatDate(order.orderDate)} />
              <RecordField label="Currency" value={order.currency} />
              <RecordField label="Status" value={<StatusBadge status={order.status} />} />
              {sourceQuote && <RecordField label="Source quote" value={sourceQuote.quoteNumber} />}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Line items">
            <DocumentLineTable
              columns={LINE_COLUMNS}
              rows={order.lineItems}
              rowKey={(l) => l.id}
              totals={[
                { label: 'Subtotal', value: formatCurrency(order.subtotal) },
                { label: 'Tax / VAT', value: formatCurrency(order.taxTotal) },
                { label: 'Total', value: formatCurrency(order.total), emphasis: true },
              ]}
            />
          </RecordPageSection>

          {order.notes && (
            <RecordPageSection title="Notes">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{order.notes}</p>
            </RecordPageSection>
          )}

          <RelatedRecordsSection items={relatedItems} />

          <RecordActivitySection
            recordType="SalesOrder"
            recordId={order.id}
            title="Record activity"
            subtitle="Changes and lifecycle events for this sales order."
          />

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete ${order.orderNumber}?`}
            description="This permanently removes the pending sales order. Once confirmed or fulfilled it is a real commitment and must be cancelled instead."
            confirmLabel="Delete draft"
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              void act(() => deleteSalesOrder(order.id), () => navigate('/sales/orders'));
            }}
          />
        </>
      )}
    </RecordPageShell>
  );
}
