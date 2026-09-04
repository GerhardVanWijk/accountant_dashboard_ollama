import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { PrinterIcon } from 'lucide-react';
import type { SalesOrder } from '@/types';
import { BusinessDocumentPreviewModal, useBusinessDocument } from '@/features/businessDocuments';
import {
  DocumentLineTable,
  RecordActionBar,
  RecordActivitySection,
  RecordField,
  RecordPageHeader,
  RecordPageSection,
  RecordPageShell,
  RecordSummaryGrid,
  RelatedRecordPreview,
  RelatedRecordsSection,
  type DocumentLineColumn,
  type RelatedRecordItem,
  type RecordPageProps,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useSalesOrderMutations } from '@/features/sales/hooks/useSalesOrderMutations';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { PartialInvoicePicker } from '@/features/sales/components/PartialInvoicePicker';
import {
  canCloseRemaining,
  computeSalesOrderFulfilment,
  displayFulfilmentStatus,
  displayInvoicingStatus,
  type SalesOrderInvoiceSelection,
  type SalesOrderLineFulfilment,
} from '@/features/sales/utils/salesOrderFulfilment';

type Line = SalesOrder['lineItems'][number];

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

function lineColumns(
  fulfilmentByLine: Map<string, SalesOrderLineFulfilment>,
  showProgress: boolean,
): DocumentLineColumn<Line>[] {
  const cols: DocumentLineColumn<Line>[] = [
    { key: 'description', header: 'Description', cell: (l) => l.description },
    { key: 'qty', header: 'Ordered', align: 'right', cell: (l) => fmtQty(l.quantity) },
  ];
  if (showProgress) {
    cols.push(
      {
        key: 'fulfilled',
        header: 'Invoiced',
        align: 'right',
        cell: (l) => fmtQty(fulfilmentByLine.get(l.id)?.postedFulfilledQty ?? 0),
      },
      {
        key: 'remaining',
        header: 'Remaining',
        align: 'right',
        cell: (l) => fmtQty(fulfilmentByLine.get(l.id)?.remainingToFulfilQty ?? l.quantity),
      },
    );
  }
  cols.push(
    { key: 'unit', header: 'Unit price', align: 'right', cell: (l) => formatCurrency(l.unitPrice) },
    { key: 'tax', header: 'Tax', align: 'right', cell: (l) => formatCurrency(l.taxAmount) },
    { key: 'total', header: 'Total', align: 'right', cell: (l) => formatCurrency(l.lineTotal) },
  );
  return cols;
}

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
export function SalesOrderDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ orderId: string }>();
  const orderId = recordId ?? params.orderId;
  const navigate = useNavigate();

  const { salesOrders, isLoading, error, refetch } = useSalesOrders();
  const order = salesOrders.find((o) => o.id === orderId);
  const { customers: customerMap } = useCustomerMap();
  const { quotes } = useQuotes();
  const { invoices, refetch: refetchInvoices } = useInvoices();
  const { deliveryNotes } = useDeliveryNotes();
  const { warehouses } = useWarehouses();

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [invoicePreviewId, setInvoicePreviewId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{ id: string; number: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [deliveryNotePreviewId, setDeliveryNotePreviewId] = useState<string | null>(null);
  const { viewModel, loading: docLoading, error: docError } = useBusinessDocument({ kind: 'sales_order', record: order });

  const fulfilment = useMemo(
    () => (order ? computeSalesOrderFulfilment(order, invoices, deliveryNotes) : undefined),
    [order, invoices, deliveryNotes],
  );
  const linkedDeliveryNotes = useMemo(
    () => (order ? deliveryNotes.filter((dn) => dn.salesOrderId === order.id).sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate)) : []),
    [order, deliveryNotes],
  );
  const warehouseByIdMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const fulfilmentByLine = useMemo(() => {
    const map = new Map<string, SalesOrderLineFulfilment>();
    fulfilment?.lines.forEach((l) => map.set(l.salesOrderLineId, l));
    return map;
  }, [fulfilment]);
  const linkedInvoices = useMemo(
    () =>
      order
        ? invoices
            .filter((inv) => inv.salesOrderId === order.id && inv.status !== 'void')
            .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
        : [],
    [order, invoices],
  );
  // Show the Ordered/Invoiced/Remaining detail only once there is line-level
  // evidence, or the order is confirmed/pending (nothing invoiced yet) — a
  // legacy full conversion has no trustworthy per-line numbers.
  const showProgress = Boolean(
    fulfilment && (fulfilment.hasLineLevelEvidence || linkedInvoices.length === 0),
  );

  const { deleteSalesOrder, confirmOrder, cancelOrder, closeRemaining, createInvoiceFromSalesOrder, duplicateSalesOrder, isLoading: isBusy } = useSalesOrderMutations({
    onSuccess: () => refetch(),
  });

  async function handleCreateInvoice(selections: SalesOrderInvoiceSelection[]) {
    if (!order) return;
    setPickerError(null);
    setPickerBusy(true);
    try {
      const invoice = await createInvoiceFromSalesOrder(order.id, selections);
      setPickerOpen(false);
      setCreatedInvoice({ id: invoice.id, number: invoice.invoiceNumber });
      await Promise.all([refetch(), refetchInvoices()]);
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Could not create the invoice.');
    } finally {
      setPickerBusy(false);
    }
  }

  const customerName = order ? customerMap.get(order.customerId) || 'Unknown customer' : '';
  const sourceQuote = order?.quoteId ? quotes.find((q) => q.id === order.quoteId) : undefined;

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!order) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    if (sourceQuote) {
      items.push({ label: 'Source quote', value: <Link className="font-medium text-brand hover:underline" to="/sales/quotes">{sourceQuote.quoteNumber}</Link> });
    }
    // Invoices are shown in their own richer "Related invoices" table below.
    return items;
  }, [order, customerName, sourceQuote]);

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
  const someInvoiced = Boolean(
    fulfilment && (fulfilment.postedFulfilledQty > 0 || fulfilment.draftInvoicedQty > 0),
  );
  // Cancel = the whole order, before any invoicing. Once invoiced, close the remainder instead.
  const canCancel =
    order != null &&
    (order.status === 'pending' || order.status === 'confirmed') &&
    !someInvoiced &&
    linkedInvoices.length === 0;
  const canClose = Boolean(order && fulfilment && canCloseRemaining(order, fulfilment));
  const canConvert =
    order != null &&
    order.status !== 'cancelled' &&
    order.status !== 'closed' &&
    order.status !== 'fulfilled' &&
    fulfilment != null &&
    fulfilment.legacyLinkedInvoiceIds.length === 0 &&
    fulfilment.remainingToInvoiceQty > 0;
  const canDelete = order?.status === 'pending';
  const convertLabel = someInvoiced ? 'Invoice remaining' : 'Create invoice';
  // Phase 5C, Part 10: an eligible confirmed order with something left to
  // physically deliver gets a "Create delivery" action alongside invoicing —
  // the two are independent (Part 13: invoicing without a prior delivery
  // remains fully supported, unrestricted).
  const canDeliver = order != null && order.status === 'confirmed' && Boolean(fulfilment && fulfilment.remainingToDeliver > 1e-6);
  const abandonValue = fulfilment
    ? order!.lineItems.reduce((sum, l) => {
        const f = fulfilmentByLine.get(l.id);
        const rem = f?.remainingToFulfilQty ?? 0;
        const orderedQty = l.quantity || 1;
        return sum + (l.lineTotal / orderedQty) * rem;
      }, 0)
    : 0;

  return (
    <RecordPageShell
      breadcrumbs={[
        { label: 'Sales' },
        { label: 'Sales orders', to: '/sales/orders' },
        { label: order?.orderNumber ?? 'Sales order' },
      ]}
      backTo="/sales/orders"
      backLabel="Sales orders"
      embedded={embedded}
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
                        label: convertLabel,
                        onClick: () => {
                          setPickerError(null);
                          setCreatedInvoice(null);
                          setPickerOpen(true);
                        },
                      }
                    : undefined
                }
                secondary={[
                  ...(canDeliver ? [{ label: 'Create delivery', onClick: () => navigate(`/sales/orders/${order.id}/deliver`) }] : []),
                  { label: 'Print / PDF', icon: PrinterIcon, onClick: () => setPreviewOpen(true) },
                  {
                    label: 'Duplicate',
                    onClick: () =>
                      void act(
                        () =>
                          duplicateSalesOrder(order.id).then((copy) => {
                            if (copy?.id) navigate(`/sales/orders/${copy.id}`);
                          }),
                        () => {},
                      ),
                  },
                  ...(canConfirm ? [{ label: 'Confirm order', onClick: () => void act(() => confirmOrder(order.id), () => {}) }] : []),
                ]}
                danger={[
                  ...(canClose ? [{ label: 'Close remaining', onClick: () => setConfirmClose(true) }] : []),
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

          {createdInvoice && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-positive/30 bg-status-positive-muted px-4 py-3 text-sm"
            >
              <span>
                Draft invoice <strong className="figure">{createdInvoice.number}</strong> created. Post it from the
                invoice to move stock and the ledger.
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="font-medium text-brand hover:underline"
                  onClick={() => setInvoicePreviewId(createdInvoice.id)}
                >
                  View invoice
                </button>
                <button
                  type="button"
                  className="font-medium text-brand hover:underline"
                  onClick={() => navigate(`/sales/invoices/${createdInvoice.id}`)}
                >
                  Open full invoice
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setCreatedInvoice(null)}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </span>
            </div>
          )}

          <RecordPageSection title="Overview">
            <RecordSummaryGrid>
              <RecordField label="Customer" value={customerName} />
              <RecordField label="Order date" value={formatDate(order.orderDate)} />
              <RecordField label="Currency" value={order.currency} />
              <RecordField label="Status" value={<StatusBadge status={order.status} />} />
              {sourceQuote && <RecordField label="Source quote" value={sourceQuote.quoteNumber} />}
              <RecordField label="Total" value={formatCurrency(order.total)} />
              {fulfilment && showProgress && (
                <>
                  <RecordField
                    label="Invoicing"
                    value={<StatusBadge status={displayInvoicingStatus(order, fulfilment)} />}
                  />
                  <RecordField
                    label="Fulfilment"
                    value={<StatusBadge status={displayFulfilmentStatus(order, fulfilment)} />}
                  />
                  <RecordField label="Ordered" value={<span className="tabular-nums">{fmtQty(fulfilment.orderedQty)}</span>} />
                  <RecordField label="Delivered" value={<span className="tabular-nums">{fmtQty(fulfilment.deliveredQty)}</span>} />
                  <RecordField label="Remaining to deliver" value={<span className="tabular-nums">{fmtQty(fulfilment.remainingToDeliver)}</span>} />
                  <RecordField label="Invoiced (posted)" value={<span className="tabular-nums">{fmtQty(fulfilment.postedFulfilledQty)}</span>} />
                  {fulfilment.draftInvoicedQty > 0 && (
                    <RecordField label="In draft invoices" value={<span className="tabular-nums">{fmtQty(fulfilment.draftInvoicedQty)}</span>} />
                  )}
                  <RecordField label="Remaining to invoice" value={<span className="tabular-nums">{fmtQty(fulfilment.remainingToInvoiceQty)}</span>} />
                  {order.status === 'confirmed' && fulfilment.remainingToDeliver > 0 && (
                    <RecordField
                      label="Stock committed"
                      value={<span className="tabular-nums">{fmtQty(fulfilment.remainingToDeliver)} unit(s) reserved</span>}
                    />
                  )}
                  {order.status === 'closed' && (
                    <RecordField
                      label="Closed"
                      value={
                        <span className="tabular-nums">
                          {fmtQty(fulfilment.remainingToFulfilQty)} un-invoiced unit(s) abandoned · commitment released
                        </span>
                      }
                    />
                  )}
                </>
              )}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Line items">
            <DocumentLineTable
              columns={lineColumns(fulfilmentByLine, showProgress)}
              rows={order.lineItems}
              rowKey={(l) => l.id}
              totals={[
                { label: 'Subtotal', value: formatCurrency(order.subtotal) },
                { label: 'Tax / VAT', value: formatCurrency(order.taxTotal) },
                { label: 'Total', value: formatCurrency(order.total), emphasis: true },
              ]}
            />
          </RecordPageSection>

          {linkedDeliveryNotes.length > 0 && (
            <RecordPageSection title="Delivery notes">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">DN number</th>
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Warehouse</th>
                      <th className="py-2 pr-3 text-right font-medium">Quantity</th>
                      <th className="py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedDeliveryNotes.map((dn) => (
                      <tr key={dn.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            className="font-medium text-brand hover:underline"
                            onClick={() => setDeliveryNotePreviewId(dn.id)}
                          >
                            {dn.deliveryNoteNumber}
                          </button>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatDate(dn.deliveryDate)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{warehouseByIdMap.get(dn.warehouseId)?.name ?? '—'}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(dn.lineItems.reduce((s, l) => s + l.quantity, 0))}</td>
                        <td className="py-2"><StatusBadge status={dn.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordPageSection>
          )}

          {linkedInvoices.length > 0 && (
            <RecordPageSection title="Related invoices">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Invoice</th>
                      <th className="py-2 pr-3 font-medium">Issued</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 text-right font-medium">Total</th>
                      <th className="py-2 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            className="font-medium text-brand hover:underline"
                            onClick={() => setInvoicePreviewId(inv.id)}
                          >
                            {inv.invoiceNumber}
                          </button>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatDate(inv.issueDate)}</td>
                        <td className="py-2 pr-3"><StatusBadge status={inv.status} /></td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(inv.total)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatCurrency(Math.max(0, inv.total - inv.amountPaid))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordPageSection>
          )}

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

          <ConfirmDialog
            open={confirmClose}
            onOpenChange={setConfirmClose}
            title={`Close remaining on ${order.orderNumber}?`}
            description={
              fulfilment
                ? `The customer will NOT be supplied the remaining ${fmtQty(fulfilment.remainingToFulfilQty)} un-invoiced unit(s) ` +
                  `(about ${formatCurrency(abandonValue)}). The ${fmtQty(fulfilment.postedFulfilledQty)} already invoiced and their ` +
                  `accounting are untouched. No stock moves, no journal, no credit note — the reserved stock is simply released.`
                : ''
            }
            confirmLabel="Close remaining"
            destructive
            onConfirm={() => {
              setConfirmClose(false);
              void act(() => closeRemaining(order.id), () => {});
            }}
          />

          <BusinessDocumentPreviewModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            viewModel={viewModel}
            loading={docLoading}
            error={docError}
          />

          <PartialInvoicePicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            order={order}
            invoices={invoices}
            customerName={customerName}
            error={pickerError}
            submitting={pickerBusy}
            onSubmit={handleCreateInvoice}
          />

          <RelatedRecordPreview
            open={invoicePreviewId != null}
            onClose={() => setInvoicePreviewId(null)}
            type="invoice"
            id={invoicePreviewId ?? undefined}
            title={
              linkedInvoices.find((i) => i.id === invoicePreviewId)?.invoiceNumber
                ? `Invoice ${linkedInvoices.find((i) => i.id === invoicePreviewId)?.invoiceNumber}`
                : 'Invoice'
            }
          />

          <RelatedRecordPreview
            open={deliveryNotePreviewId != null}
            onClose={() => setDeliveryNotePreviewId(null)}
            type="delivery_note"
            id={deliveryNotePreviewId ?? undefined}
            title={
              linkedDeliveryNotes.find((d) => d.id === deliveryNotePreviewId)?.deliveryNoteNumber
                ? `Delivery note ${linkedDeliveryNotes.find((d) => d.id === deliveryNotePreviewId)?.deliveryNoteNumber}`
                : 'Delivery note'
            }
          />
        </>
      )}
    </RecordPageShell>
  );
}
