import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PrinterIcon } from 'lucide-react';
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
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useDeliveryNoteMutations } from '@/features/sales/hooks/useDeliveryNoteMutations';
import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { BusinessDocumentPreviewModal } from '@/features/businessDocuments';
import { useDeliveryNoteBusinessDocument } from '@/features/businessDocuments/hooks/useDeliveryNoteBusinessDocument';
import { computeReturnableDeliveryNoteLines } from '@/features/sales/services';

type Line = ReturnType<typeof useDeliveryNotes>['deliveryNotes'][number]['lineItems'][number];

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

function lineColumns(): DocumentLineColumn<Line>[] {
  return [
    { key: 'description', header: 'Description', cell: (l) => l.description },
    { key: 'qty', header: 'Quantity', align: 'right', cell: (l) => fmtQty(l.quantity) },
  ];
}

/**
 * Full-page Delivery Note detail — route `/sales/delivery-notes/:deliveryNoteId`
 * (Phase 5C, Part 12). No price column shown by default on the line table
 * (a Delivery Note is physical evidence, not a priced sales document —
 * docs/DELIVERY_NOTES_DESIGN.md Part 18); the printable document follows
 * the same rule.
 */
export function DeliveryNoteDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ deliveryNoteId: string }>();
  const deliveryNoteId = recordId ?? params.deliveryNoteId;
  const navigate = useNavigate();

  const { deliveryNotes, isLoading, error, refetch } = useDeliveryNotes();
  const dn = deliveryNotes.find((d) => d.id === deliveryNoteId);
  const { salesOrders } = useSalesOrders();
  const { customers: customerMap } = useCustomerMap();
  const { warehouses } = useWarehouses();
  const { products } = useProducts();
  const { movements } = useStockMovements();
  const { invoices, refetch: refetchInvoices } = useInvoices();
  const { returnNotes } = useReturnNotes();

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [invoicePreviewId, setInvoicePreviewId] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<{ id: string; number: string } | null>(null);

  const { postDeliveryNote, cancelDraft, deleteDraft, createInvoiceFromDeliveryNote, isLoading: isBusy } =
    useDeliveryNoteMutations({ onSuccess: () => refetch() });

  const salesOrder = dn ? salesOrders.find((o) => o.id === dn.salesOrderId) : undefined;
  const warehouse = dn ? warehouses.find((w) => w.id === dn.warehouseId) : undefined;
  const customerName = dn ? customerMap.get(dn.customerId) ?? 'Unknown customer' : '';

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const relatedMovements = useMemo(
    () => (dn ? movements.filter((m) => m.sourceDocumentType === 'delivery_note' && m.sourceDocumentId === dn.id) : []),
    [movements, dn],
  );
  const linkedInvoiceLines = useMemo(() => {
    if (!dn) return [] as { invoiceId: string; invoiceNumber: string; lineId: string; deliveryNoteLineId: string; quantity: number }[];
    const out: { invoiceId: string; invoiceNumber: string; lineId: string; deliveryNoteLineId: string; quantity: number }[] = [];
    for (const inv of invoices) {
      if (inv.status === 'void') continue;
      for (const line of inv.lineItems) {
        if (line.deliveryNoteLineId && dn.lineItems.some((l) => l.id === line.deliveryNoteLineId)) {
          out.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, lineId: line.id, deliveryNoteLineId: line.deliveryNoteLineId, quantity: line.quantity });
        }
      }
    }
    return out;
  }, [dn, invoices]);

  const estimatedValue = dn
    ? dn.lineItems.reduce((sum, l) => sum + (productById.get(l.productId)?.costPrice ?? 0) * l.quantity, 0)
    : 0;

  const { viewModel, loading: docLoading, error: docError } = useDeliveryNoteBusinessDocument(dn);

  async function act(fn: () => Promise<unknown>, after: () => void) {
    setActionError(null);
    try {
      await fn();
      after();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this delivery note.');
    }
  }

  async function handleCreateInvoice() {
    if (!dn) return;
    try {
      const invoice = await createInvoiceFromDeliveryNote(dn.id);
      setCreatedInvoice({ id: invoice.id, number: invoice.invoiceNumber });
      await Promise.all([refetch(), refetchInvoices()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create the invoice.');
    }
  }

  const state = isLoading ? 'loading' : error ? 'error' : dn ? 'ready' : 'not-found';
  const canPost = dn?.status === 'draft';
  const canCancel = dn?.status === 'draft';
  const canDelete = dn?.status === 'draft';
  const canInvoice = dn?.status === 'posted' && linkedInvoiceLines.reduce((s, l) => s + l.quantity, 0) < dn.lineItems.reduce((s, l) => s + l.quantity, 0) - 1e-6;

  const relatedReturnNotes = useMemo(() => (dn ? returnNotes.filter((rn) => rn.deliveryNoteId === dn.id) : []), [returnNotes, dn]);
  const returnableLines = useMemo(() => (dn ? computeReturnableDeliveryNoteLines(dn, invoices, returnNotes) : []), [dn, invoices, returnNotes]);
  const canReturn = dn?.status === 'posted' && returnableLines.some((l) => l.returnableQty > 1e-6);

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!dn) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    if (salesOrder) {
      items.push({ label: 'Sales order', value: <Link className="font-medium text-brand hover:underline" to={`/sales/orders/${salesOrder.id}`}>{salesOrder.orderNumber}</Link> });
    }
    if (warehouse) {
      items.push({ label: 'Warehouse', value: warehouse.name });
    }
    return items;
  }, [dn, customerName, salesOrder, warehouse]);

  return (
    <RecordPageShell
      breadcrumbs={[
        { label: 'Sales' },
        { label: 'Delivery notes', to: '/sales/delivery-notes' },
        { label: dn?.deliveryNoteNumber ?? 'Delivery note' },
      ]}
      backTo="/sales/delivery-notes"
      backLabel="Delivery notes"
      embedded={embedded}
      state={state}
      notFoundMessage="This delivery note could not be found — it may have been deleted."
    >
      {dn && (
        <>
          <RecordPageHeader
            recordNumber={dn.deliveryNoteNumber}
            title={customerName}
            meta={`Delivery date ${formatDate(dn.deliveryDate)}${salesOrder ? ` · from ${salesOrder.orderNumber}` : ''}`}
            status={<StatusBadge status={dn.status} />}
            actions={
              <RecordActionBar
                busy={isBusy}
                primary={
                  canPost
                    ? { label: 'Post delivery', onClick: () => setConfirmPost(true) }
                    : canInvoice
                      ? { label: 'Create invoice', onClick: () => void handleCreateInvoice() }
                      : undefined
                }
                secondary={[
                  { label: 'Print / PDF', icon: PrinterIcon, onClick: () => setPreviewOpen(true) },
                  ...(canReturn ? [{ label: 'Create return', onClick: () => navigate(`/sales/delivery-notes/${dn.id}/return`) }] : []),
                ]}
                danger={[
                  ...(canCancel ? [{ label: 'Cancel draft', onClick: () => setConfirmCancel(true) }] : []),
                  ...(canDelete ? [{ label: 'Delete draft', onClick: () => void act(() => deleteDraft(dn.id), () => navigate('/sales/delivery-notes')) }] : []),
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
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-positive/30 bg-status-positive-muted px-4 py-3 text-sm">
              <span>
                Draft invoice <strong className="figure">{createdInvoice.number}</strong> created from this delivery.
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => setInvoicePreviewId(createdInvoice.id)}>
                  View invoice
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setCreatedInvoice(null)} aria-label="Dismiss">
                  ✕
                </button>
              </span>
            </div>
          )}

          <RecordPageSection title="Overview">
            <RecordSummaryGrid>
              <RecordField label="Customer" value={customerName} />
              <RecordField label="Delivery date" value={formatDate(dn.deliveryDate)} />
              <RecordField label="Warehouse" value={warehouse?.name ?? '—'} />
              <RecordField label="Status" value={<StatusBadge status={dn.status} />} />
              {salesOrder && <RecordField label="Sales order" value={salesOrder.orderNumber} />}
              <RecordField label="Items" value={<span className="tabular-nums">{fmtQty(dn.lineItems.reduce((s, l) => s + l.quantity, 0))}</span>} />
              {dn.status === 'draft' && (
                <RecordField
                  label="Estimated accounting effect on posting"
                  value={
                    <span className="text-sm">
                      DR 1220 Goods Delivered Not Invoiced / CR 1200 Inventory ≈ {formatCurrency(estimatedValue)}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        No revenue, no VAT, no receivable is created. Final cost is authoritative only at posting time.
                      </span>
                    </span>
                  }
                />
              )}
              {dn.status === 'posted' && dn.journalEntryId && (
                <RecordField
                  label="Journal entry"
                  value={
                    <Link className="font-medium text-brand hover:underline" to={`/accounting/journals?record=${dn.journalEntryId}`}>
                      View journal entry
                    </Link>
                  }
                />
              )}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Line items">
            <DocumentLineTable columns={lineColumns()} rows={dn.lineItems} rowKey={(l) => l.id} />
          </RecordPageSection>

          {relatedMovements.length > 0 && (
            <RecordPageSection title="Stock movement evidence">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Product</th>
                      <th className="py-2 pr-3 text-right font-medium">Quantity</th>
                      <th className="py-2 pr-3 text-right font-medium">Unit cost</th>
                      <th className="py-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedMovements.map((m) => (
                      <tr key={m.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 text-muted-foreground">{m.movementDate ? formatDate(m.movementDate) : '—'}</td>
                        <td className="py-2 pr-3">{productById.get(m.productId)?.name ?? m.productId}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(Math.abs(m.quantityDelta))}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{m.unitCost != null ? formatCurrency(m.unitCost) : '—'}</td>
                        <td className="py-2 text-right tabular-nums">{m.totalCost != null ? formatCurrency(m.totalCost) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordPageSection>
          )}

          {linkedInvoiceLines.length > 0 && (
            <RecordPageSection title="Invoiced from this delivery">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Invoice</th>
                      <th className="py-2 text-right font-medium">Quantity invoiced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedInvoiceLines.map((l) => (
                      <tr key={l.lineId} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3">
                          <button type="button" className="font-medium text-brand hover:underline" onClick={() => setInvoicePreviewId(l.invoiceId)}>
                            {l.invoiceNumber}
                          </button>
                        </td>
                        <td className="py-2 text-right tabular-nums">{fmtQty(l.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordPageSection>
          )}

          {relatedReturnNotes.length > 0 && (
            <RecordPageSection title="Returns from this delivery">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Return note</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Quantity returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedReturnNotes.map((rn) => (
                      <tr key={rn.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3">
                          <Link className="font-medium text-brand hover:underline" to={`/sales/return-notes/${rn.id}`}>
                            {rn.returnNoteNumber}
                          </Link>
                        </td>
                        <td className="py-2 pr-3"><StatusBadge status={rn.status} /></td>
                        <td className="py-2 text-right tabular-nums">{fmtQty(rn.lineItems.reduce((s, l) => s + l.quantity, 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordPageSection>
          )}

          {dn.notes && (
            <RecordPageSection title="Notes">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{dn.notes}</p>
            </RecordPageSection>
          )}

          <RelatedRecordsSection items={relatedItems} />

          <RecordActivitySection
            recordType="DeliveryNote"
            recordId={dn.id}
            title="Record activity"
            subtitle="Changes and lifecycle events for this delivery note."
          />

          <ConfirmDialog
            open={confirmPost}
            onOpenChange={setConfirmPost}
            title={`Post ${dn.deliveryNoteNumber}?`}
            description={`This records the physical departure of ${fmtQty(dn.lineItems.reduce((s, l) => s + l.quantity, 0))} unit(s) from ${warehouse?.name ?? 'the warehouse'}, freezes cost, and posts DR 1220 Goods Delivered Not Invoiced / CR 1200 Inventory ≈ ${formatCurrency(estimatedValue)}. No revenue, VAT or receivable is created. This cannot be undone once posted.`}
            confirmLabel="Post delivery"
            onConfirm={() => {
              setConfirmPost(false);
              void act(() => postDeliveryNote(dn.id), () => {});
            }}
          />

          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${dn.deliveryNoteNumber}?`}
            description="This abandons the draft delivery note. Nothing has posted yet, so there is nothing to reverse."
            confirmLabel="Cancel draft"
            destructive
            onConfirm={() => {
              setConfirmCancel(false);
              void act(() => cancelDraft(dn.id), () => {});
            }}
          />

          <BusinessDocumentPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} viewModel={viewModel} loading={docLoading} error={docError} />

          <RelatedRecordPreview
            open={invoicePreviewId != null}
            onClose={() => setInvoicePreviewId(null)}
            type="invoice"
            id={invoicePreviewId ?? undefined}
            title="Invoice"
          />
        </>
      )}
    </RecordPageShell>
  );
}
