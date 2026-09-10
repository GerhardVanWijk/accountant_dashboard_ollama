import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangleIcon, BoxesIcon, PackageCheckIcon, PackageXIcon, PrinterIcon, ReceiptTextIcon } from 'lucide-react';
import type { PurchaseOrder } from '@/types';
import { BusinessDocumentPreviewModal, useBusinessDocument } from '@/features/businessDocuments';
import {
  DocumentLineTable,
  documentLineColumns,
  RecordActionBar,
  RecordActivitySection,
  RecordField,
  RecordPageHeader,
  RecordPageSection,
  RecordPageShell,
  RecordSummaryGrid,
  RecordTabs,
  RelatedRecordsSection,
  type RecordTab,
  type RelatedRecordItem,
  type RecordPageProps,
} from '@/components/app/record-page';
import { StatStrip, StatTile } from '@/components/app/stat-tile';
import { StatusBadge } from '@/components/app/status-badge';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { toAccountingErrorMessage } from '@/features/accounting/utils/accountingError';
import { getTaxRateLabel, MOVEMENT_TYPE_LABELS } from '@/features/inventory/constants';
import { movementsForSource } from '@/features/inventory/utils/movementSource';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePurchaseOrders, usePurchaseOrderMutations, useBills, useBillMutations } from '@/features/purchases/hooks';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';

const fmtQty = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 3 });

/**
 * Full-page Purchase Order detail — route
 * `/purchases/orders/:purchaseOrderId`. A tabbed workspace: Overview (what
 * this PO is and where it stands), Line items, Receiving (goods-receipt
 * events + procurement state), Supplier invoice (the downstream document),
 * Related records, Activity. Same
 * purchaseOrderService.sendPurchaseOrder()/recordReceipt()/convertToBill()
 * calls as before.
 */
export function PurchaseOrderDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ purchaseOrderId: string }>();
  const purchaseOrderId = recordId ?? params.purchaseOrderId;
  const navigate = useNavigate();

  const { purchaseOrders, isLoading, error, refetch } = usePurchaseOrders();
  const po = purchaseOrders.find((p) => p.id === purchaseOrderId);
  const { suppliers } = useSuppliers();
  const { bills } = useBills();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { movements } = useStockMovements();
  const { taxRates, loading: taxRatesLoading, error: taxRatesError } = useAllTaxRates();

  const poMutations = usePurchaseOrderMutations();
  const billMutations = useBillMutations();
  const isBusy = poMutations.isLoading || billMutations.isLoading;

  const [actionError, setActionError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { viewModel, loading: docLoading, error: docError } = useBusinessDocument({ kind: 'purchase_order', record: po });

  const suppliersMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const supplierName = po ? suppliersMap.get(po.supplierId) ?? 'Unknown supplier' : '';
  const convertedBill = po?.billId ? bills.find((b) => b.id === po.billId) : undefined;

  // Attribute receipt movements to this PO by structured source columns OR a
  // parsed legacy `purchase_order:<uuid>` reference — a naive
  // `sourceDocumentType === 'purchase_order'` filter used to miss them all,
  // which is why a received PO showed "Received 0".
  const poMovements = useMemo(() => movementsForSource(movements, 'purchase_order', po?.id), [movements, po?.id]);

  const orderedQty = useMemo(() => (po ? po.lineItems.reduce((s, l) => s + (l.quantity ?? 0), 0) : 0), [po]);
  const receivedQty = useMemo(
    () => poMovements.reduce((s, m) => s + Math.abs(m.quantityDelta ?? 0), 0),
    [poMovements],
  );
  const remainingQty = Math.max(0, orderedQty - receivedQty);
  // "Status says received but nothing is attributable" — a genuine integrity gap, called out rather than glossed.
  const receivingIntegrityGap = Boolean(po?.receivedDate && poMovements.length === 0);

  const lineColumns = useMemo(
    () =>
      documentLineColumns<PurchaseOrder['lineItems'][number]>({
        resolveProduct: (id) => {
          const p = id ? productMap.get(id) : undefined;
          return p ? { sku: p.sku, name: p.name } : undefined;
        },
        resolveTaxLabel: (id) => getTaxRateLabel(id, taxRates, { pending: taxRatesLoading || Boolean(taxRatesError) }),
        totalHeader: 'Line total',
      }),
    [productMap, taxRates, taxRatesLoading, taxRatesError],
  );

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!po) return [];
    const items: RelatedRecordItem[] = [
      {
        label: 'Supplier',
        value: <span className="font-medium">{supplierName}</span>,
        onActivate: () => navigate(`/purchases/vendors?record=${po.supplierId}`),
      },
    ];
    if (poMovements.length > 0) {
      items.push({
        label: 'Goods received',
        value: (
          <span className="text-muted-foreground tabular-nums">
            {poMovements.length} stock movement{poMovements.length === 1 ? '' : 's'}
          </span>
        ),
        onActivate: () => navigate({ search: '?tab=receiving' }),
      });
    }
    if (convertedBill) {
      items.push({
        label: `Supplier invoice ${convertedBill.billNumber}`,
        value: <StatusBadge status={convertedBill.status} />,
        onActivate: () => navigate(`/purchases/bills/${convertedBill.id}`),
      });
    }
    if (po.journalEntryId) {
      items.push({
        label: 'Journal entry',
        value: <span className="text-muted-foreground">GL posting — goods received</span>,
        onActivate: () => navigate(`/accounting/journals?record=${po.journalEntryId}`),
      });
    }
    return items;
  }, [po, supplierName, convertedBill, poMovements, navigate]);

  async function act(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (err) {
      setActionError(toAccountingErrorMessage(err, { reference: po?.poNumber, action: 'update this purchase order' }));
    }
  }

  async function createSupplierInvoice() {
    if (!po) return;
    setActionError(null);
    try {
      const draft = await poMutations.convertToBill(po.id);
      const bill = await billMutations.createBill({ ...draft, status: 'draft' });
      await billMutations.postBill(bill.id);
      await poMutations.updatePurchaseOrder(po.id, { billId: bill.id });
      navigate(`/purchases/bills/${bill.id}`);
    } catch (err) {
      setActionError(toAccountingErrorMessage(err, { reference: po.poNumber, action: 'create the supplier invoice' }));
    }
  }

  const state = isLoading ? 'loading' : error ? 'error' : po ? 'ready' : 'not-found';

  const canSend = po?.status === 'draft';
  const canReceive = po?.status === 'sent' || po?.status === 'partially_received';
  const canCancel = po != null && po.status !== 'received' && po.status !== 'cancelled';
  const canConvert = po != null && po.status !== 'draft' && po.status !== 'cancelled' && !po.billId;

  const supplierInvoiceState = convertedBill
    ? `${convertedBill.billNumber} · ${convertedBill.status.replace(/_/g, ' ')}`
    : canConvert
      ? 'Not created yet'
      : '—';

  const receivingEvents =
    poMovements.length === 0 ? (
      receivingIntegrityGap ? (
        <div className="flex items-start gap-2 rounded-lg border border-status-warning-outline bg-status-warning-surface/40 px-4 py-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          <p className="text-muted-foreground">
            This purchase order is marked received on {formatDate(po!.receivedDate!)}, but no stock movements are
            attributed to it. The goods receipt may have been recorded against the supplier invoice instead, or the
            movement predates structured source links. Check the Supplier invoice tab and the product ledger.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No goods have been received against this purchase order yet.</p>
      )
    ) : (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit cost</th>
              <th className="px-4 py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {poMovements.map((m) => {
              const product = productMap.get(m.productId);
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(m.movementDate ?? m.createdAt)}</td>
                  <td className="px-4 py-2">
                    {product ? <Link className="text-brand hover:underline" to={`/inventory/products/${product.id}`}>{product.name}</Link> : m.productId}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                  <td className="px-4 py-2 text-muted-foreground">{warehouseMap.get(m.warehouseId) ?? m.warehouseId}</td>
                  <td className="figure px-4 py-2 text-right tabular-nums">{m.quantityDelta.toFixed(2)}</td>
                  <td className="figure px-4 py-2 text-right tabular-nums">{m.unitCost != null ? formatCurrency(m.unitCost) : '—'}</td>
                  <td className="figure px-4 py-2 text-right tabular-nums">{m.totalCost != null ? formatCurrency(m.totalCost) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  const tabs: RecordTab[] = po
    ? [
        {
          value: 'overview',
          label: 'Overview',
          content: (
            <>
              <RecordPageSection title="Order details">
                <RecordSummaryGrid>
                  <RecordField label="Order date" value={formatDate(po.orderDate)} />
                  {po.expectedDate && <RecordField label="Expected date" value={formatDate(po.expectedDate)} />}
                  {po.receivedDate && <RecordField label="Received date" value={formatDate(po.receivedDate)} />}
                  <RecordField label="Currency" value={po.currency} />
                </RecordSummaryGrid>
              </RecordPageSection>
              <RecordPageSection title="Amounts">
                <RecordSummaryGrid>
                  <RecordField label="Subtotal" value={formatCurrency(po.subtotal)} />
                  <RecordField label="VAT" value={formatCurrency(po.taxTotal)} />
                  <RecordField label="Total" value={formatCurrency(po.total)} />
                  <RecordField label="Supplier invoice" value={supplierInvoiceState} />
                </RecordSummaryGrid>
              </RecordPageSection>
              {po.notes && (
                <RecordPageSection title="Notes">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{po.notes}</p>
                </RecordPageSection>
              )}
            </>
          ),
        },
        {
          value: 'line-items',
          label: 'Line items',
          count: po.lineItems.length,
          content: (
            <RecordPageSection title="Line items">
              <DocumentLineTable
                columns={lineColumns}
                rows={po.lineItems}
                rowKey={(l) => l.id}
                minWidthClassName="min-w-[860px]"
                totals={[
                  { label: 'Subtotal', value: formatCurrency(po.subtotal) },
                  { label: 'VAT', value: formatCurrency(po.taxTotal) },
                  { label: 'Total', value: formatCurrency(po.total), emphasis: true },
                ]}
              />
            </RecordPageSection>
          ),
        },
        {
          value: 'receiving',
          label: 'Receiving',
          count: poMovements.length,
          content: (
            <>
              <RecordPageSection title="Procurement state">
                <RecordSummaryGrid>
                  <RecordField label="Ordered" value={<span className="tabular-nums">{fmtQty(orderedQty)}</span>} />
                  <RecordField label="Received" value={<span className="tabular-nums">{fmtQty(receivedQty)}</span>} />
                  <RecordField label="Remaining" value={<span className="tabular-nums">{fmtQty(remainingQty)}</span>} />
                  <RecordField
                    label="Goods received posting"
                    value={po.journalEntryId ? 'Posted — DR Inventory / CR GRNI' : 'Not yet posted'}
                  />
                </RecordSummaryGrid>
              </RecordPageSection>
              <RecordPageSection title="Goods received">
                {receivedQty > 0 && remainingQty === 0 && (
                  <p className="mb-3 text-sm text-status-positive">All ordered goods have been received.</p>
                )}
                {receivingEvents}
                {po.journalEntryId && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    A linked supplier invoice clears GRNI rather than debiting Inventory again, and does not re-record the stock movement.
                  </p>
                )}
              </RecordPageSection>
            </>
          ),
        },
        {
          value: 'supplier-invoice',
          label: 'Supplier invoice',
          content: (
            <RecordPageSection title="Supplier invoice">
              {convertedBill ? (
                <RecordSummaryGrid>
                  <RecordField
                    label="Supplier invoice"
                    value={<Link className="text-brand hover:underline" to={`/purchases/bills/${convertedBill.id}`}>{convertedBill.billNumber}</Link>}
                  />
                  <RecordField label="Status" value={<StatusBadge status={convertedBill.status} />} />
                  <RecordField label="Total" value={formatCurrency(convertedBill.total)} />
                  <RecordField label="Outstanding" value={formatCurrency(Math.max(0, convertedBill.total - convertedBill.amountPaid))} />
                </RecordSummaryGrid>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No supplier invoice has been created from this purchase order yet.
                  {canConvert ? ' Use “Create supplier invoice” once the supplier’s tax invoice arrives.' : ''}
                </p>
              )}
            </RecordPageSection>
          ),
        },
        {
          value: 'related',
          label: 'Related records',
          count: relatedItems.length,
          content: <RelatedRecordsSection items={relatedItems} />,
        },
        {
          value: 'activity',
          label: 'Activity',
          content: (
            <RecordActivitySection recordType="PurchaseOrder" recordId={po.id} title="Record activity" subtitle="Changes and lifecycle events for this purchase order." />
          ),
        },
      ]
    : [];

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Purchases' }, { label: 'Purchase orders', to: '/purchases/orders' }, { label: po?.poNumber ?? 'Purchase order' }]}
      backTo="/purchases/orders"
      backLabel="Purchase orders"
      embedded={embedded}
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This purchase order could not be found — it may have been deleted."
    >
      {po && (
        <>
          <RecordPageHeader
            recordNumber={po.poNumber}
            title={supplierName}
            meta={`Ordered ${formatDate(po.orderDate)}${po.expectedDate ? ` · expected ${formatDate(po.expectedDate)}` : ''}${po.receivedDate ? ` · received ${formatDate(po.receivedDate)}` : ''}`}
            status={<StatusBadge status={po.status} />}
            actions={
              <RecordActionBar
                busy={isBusy}
                primary={canConvert ? { label: 'Create supplier invoice', onClick: () => void createSupplierInvoice() } : undefined}
                secondary={[
                  { label: 'Print / PDF', icon: PrinterIcon, onClick: () => setPreviewOpen(true) },
                  ...(canSend ? [{ label: 'Send to supplier', onClick: () => void act(() => poMutations.sendPurchaseOrder(po.id)) }] : []),
                  ...(canReceive ? [{ label: 'Receive goods', onClick: () => void act(() => poMutations.recordReceipt(po.id)) }] : []),
                ]}
                danger={canCancel ? [{ label: 'Cancel order', onClick: () => void act(() => poMutations.updatePurchaseOrder(po.id, { status: 'cancelled' })) }] : []}
              />
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <StatStrip columns={4}>
            <StatTile variant="compact" icon={ReceiptTextIcon} label="PO total" value={formatCurrency(po.total)} />
            <StatTile variant="compact" icon={BoxesIcon} label="Ordered" value={fmtQty(orderedQty)} />
            <StatTile variant="compact" icon={PackageCheckIcon} label="Received" value={fmtQty(receivedQty)} tone={receivedQty > 0 ? 'positive' : 'default'} />
            <StatTile
              variant="compact"
              icon={PackageXIcon}
              label="Remaining"
              value={fmtQty(remainingQty)}
              tone={remainingQty > 0 && po.status !== 'cancelled' ? 'warning' : 'default'}
            />
          </StatStrip>

          <RecordTabs urlParam="tab" embedded={embedded} ariaLabel="Purchase order sections" tabs={tabs} />

          <BusinessDocumentPreviewModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            viewModel={viewModel}
            loading={docLoading}
            error={docError}
          />
        </>
      )}
    </RecordPageShell>
  );
}
