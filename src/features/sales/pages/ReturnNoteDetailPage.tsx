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
  RelatedRecordsSection,
  type DocumentLineColumn,
  type RelatedRecordItem,
  type RecordPageProps,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useReturnNotes } from '@/features/sales/hooks/useReturnNotes';
import { useReturnNoteMutations } from '@/features/sales/hooks/useReturnNoteMutations';
import { useDeliveryNotes } from '@/features/sales/hooks/useDeliveryNotes';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { BusinessDocumentPreviewModal } from '@/features/businessDocuments';
import { useReturnNoteBusinessDocument } from '@/features/businessDocuments/hooks/useReturnNoteBusinessDocument';

type Line = ReturnType<typeof useReturnNotes>['returnNotes'][number]['lineItems'][number];

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

function lineColumns(): DocumentLineColumn<Line>[] {
  return [
    { key: 'description', header: 'Description', cell: (l) => l.description },
    { key: 'qty', header: 'Quantity', align: 'right', cell: (l) => fmtQty(l.quantity) },
  ];
}

/**
 * Full-page Return Note detail — route `/sales/return-notes/:returnNoteId`
 * (Phase 5D). No price column shown by default on the line table — same
 * price-suppressed convention as the Delivery Note detail page, since a
 * Return Note posts no revenue.
 */
export function ReturnNoteDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ returnNoteId: string }>();
  const returnNoteId = recordId ?? params.returnNoteId;
  const navigate = useNavigate();

  const { returnNotes, isLoading, error, refetch } = useReturnNotes();
  const rn = returnNotes.find((r) => r.id === returnNoteId);
  const { deliveryNotes } = useDeliveryNotes();
  const { salesOrders } = useSalesOrders();
  const { customers: customerMap } = useCustomerMap();
  const { warehouses } = useWarehouses();
  const { products } = useProducts();
  const { movements } = useStockMovements();

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { postReturnNote, cancelDraft, deleteDraft, isLoading: isBusy } =
    useReturnNoteMutations({ onSuccess: () => refetch() });

  const deliveryNote = rn ? deliveryNotes.find((d) => d.id === rn.deliveryNoteId) : undefined;
  const salesOrder = rn ? salesOrders.find((o) => o.id === rn.salesOrderId) : undefined;
  const warehouse = rn ? warehouses.find((w) => w.id === rn.warehouseId) : undefined;
  const customerName = rn ? customerMap.get(rn.customerId) ?? 'Unknown customer' : '';

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const relatedMovements = useMemo(
    () => (rn ? movements.filter((m) => m.sourceDocumentType === 'return_note' && m.sourceDocumentId === rn.id) : []),
    [movements, rn],
  );

  const estimatedValue = rn
    ? rn.lineItems.reduce((sum, l) => sum + l.unitCost * l.quantity, 0)
    : 0;

  const { viewModel, loading: docLoading, error: docError } = useReturnNoteBusinessDocument(rn);

  async function act(fn: () => Promise<unknown>, after: () => void) {
    setActionError(null);
    try {
      await fn();
      after();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this return note.');
    }
  }

  const state = isLoading ? 'loading' : error ? 'error' : rn ? 'ready' : 'not-found';
  const canPost = rn?.status === 'draft';
  const canCancel = rn?.status === 'draft';
  const canDelete = rn?.status === 'draft';

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!rn) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    if (deliveryNote) {
      items.push({ label: 'Delivery note', value: <Link className="font-medium text-brand hover:underline" to={`/sales/delivery-notes/${deliveryNote.id}`}>{deliveryNote.deliveryNoteNumber}</Link> });
    }
    if (salesOrder) {
      items.push({ label: 'Sales order', value: <Link className="font-medium text-brand hover:underline" to={`/sales/orders/${salesOrder.id}`}>{salesOrder.orderNumber}</Link> });
    }
    if (warehouse) {
      items.push({ label: 'Warehouse', value: warehouse.name });
    }
    return items;
  }, [rn, customerName, deliveryNote, salesOrder, warehouse]);

  return (
    <RecordPageShell
      breadcrumbs={[
        { label: 'Sales' },
        { label: 'Return notes', to: '/sales/return-notes' },
        { label: rn?.returnNoteNumber ?? 'Return note' },
      ]}
      backTo="/sales/return-notes"
      backLabel="Return notes"
      embedded={embedded}
      state={state}
      notFoundMessage="This return note could not be found — it may have been deleted."
    >
      {rn && (
        <>
          <RecordPageHeader
            recordNumber={rn.returnNoteNumber}
            title={customerName}
            meta={`Return date ${formatDate(rn.returnDate)}${deliveryNote ? ` · from ${deliveryNote.deliveryNoteNumber}` : ''}`}
            status={<StatusBadge status={rn.status} />}
            actions={
              <RecordActionBar
                busy={isBusy}
                primary={canPost ? { label: 'Post return', onClick: () => setConfirmPost(true) } : undefined}
                secondary={[{ label: 'Print / PDF', icon: PrinterIcon, onClick: () => setPreviewOpen(true) }]}
                danger={[
                  ...(canCancel ? [{ label: 'Cancel draft', onClick: () => setConfirmCancel(true) }] : []),
                  ...(canDelete ? [{ label: 'Delete draft', onClick: () => void act(() => deleteDraft(rn.id), () => navigate('/sales/return-notes')) }] : []),
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
              <RecordField label="Return date" value={formatDate(rn.returnDate)} />
              <RecordField label="Warehouse" value={warehouse?.name ?? '—'} />
              <RecordField label="Status" value={<StatusBadge status={rn.status} />} />
              {deliveryNote && <RecordField label="Delivery note" value={deliveryNote.deliveryNoteNumber} />}
              {salesOrder && <RecordField label="Sales order" value={salesOrder.orderNumber} />}
              <RecordField label="Items" value={<span className="tabular-nums">{fmtQty(rn.lineItems.reduce((s, l) => s + l.quantity, 0))}</span>} />
              {rn.status === 'draft' && (
                <RecordField
                  label="Estimated accounting effect on posting"
                  value={
                    <span className="text-sm">
                      DR 1200 Inventory / CR 1220 Goods Delivered Not Invoiced ≈ {formatCurrency(estimatedValue)}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        Reverses the ORIGINAL delivery's frozen cost — no revenue, VAT, AR or refund is created. Final cost is authoritative only at posting time.
                      </span>
                    </span>
                  }
                />
              )}
              {rn.status === 'posted' && rn.journalEntryId && (
                <RecordField
                  label="Journal entry"
                  value={
                    <Link className="font-medium text-brand hover:underline" to={`/accounting/journals?record=${rn.journalEntryId}`}>
                      View journal entry
                    </Link>
                  }
                />
              )}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Line items">
            <DocumentLineTable columns={lineColumns()} rows={rn.lineItems} rowKey={(l) => l.id} />
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

          {rn.notes && (
            <RecordPageSection title="Notes">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{rn.notes}</p>
            </RecordPageSection>
          )}

          <RelatedRecordsSection items={relatedItems} />

          <RecordActivitySection
            recordType="ReturnNote"
            recordId={rn.id}
            title="Record activity"
            subtitle="Changes and lifecycle events for this return note."
          />

          <ConfirmDialog
            open={confirmPost}
            onOpenChange={setConfirmPost}
            title={`Post ${rn.returnNoteNumber}?`}
            description={`This records ${fmtQty(rn.lineItems.reduce((s, l) => s + l.quantity, 0))} unit(s) physically returning to ${warehouse?.name ?? 'the warehouse'} at the original delivery's frozen cost, and posts DR 1200 Inventory / CR 1220 Goods Delivered Not Invoiced ≈ ${formatCurrency(estimatedValue)}. No revenue, VAT, AR or refund is created. This cannot be undone once posted.`}
            confirmLabel="Post return"
            onConfirm={() => {
              setConfirmPost(false);
              void act(() => postReturnNote(rn.id), () => {});
            }}
          />

          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${rn.returnNoteNumber}?`}
            description="This abandons the draft return note. Nothing has posted yet, so there is nothing to reverse."
            confirmLabel="Cancel draft"
            destructive
            onConfirm={() => {
              setConfirmCancel(false);
              void act(() => cancelDraft(rn.id), () => {});
            }}
          />

          <BusinessDocumentPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} viewModel={viewModel} loading={docLoading} error={docError} />
        </>
      )}
    </RecordPageShell>
  );
}
