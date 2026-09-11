import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BanknoteIcon, PackageIcon, ReceiptTextIcon, WalletIcon } from 'lucide-react';
import type { Bill } from '@/types';
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
import { useBills, useBillMutations, usePayments, usePaymentMutations, usePurchaseOrders } from '@/features/purchases/hooks';
import { PaymentFormModal } from '@/features/purchases/components/PaymentFormModal';
import { nextDocumentNumber } from '@/features/purchases/utils/nextDocumentNumber';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useLeases } from '@/features/leases/hooks/useLeases';

/**
 * Full-page Supplier Invoice detail — route `/purchases/bills/:billId`.
 * ("Supplier Invoice" is the South African term for what the data model
 * still calls a `Bill`; the DB columns are unchanged.) Shows the purchasing
 * chain: supplier → source purchase order (document-level FK only, no line
 * relationship — Phase 9B) → goods received → this supplier invoice →
 * payments → GL posting. Same billService.postBill()/
 * paymentService.createPayment() calls as before — accounting unchanged.
 */
export function BillDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ billId: string }>();
  const billId = recordId ?? params.billId;
  const navigate = useNavigate();

  const { bills, isLoading, error, refetch } = useBills();
  const bill = bills.find((b) => b.id === billId);
  const { suppliers } = useSuppliers();
  const { purchaseOrders } = usePurchaseOrders();
  const { payments, refetch: refetchPayments } = usePayments();
  const { createPayment } = usePaymentMutations();
  const billMutations = useBillMutations();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { movements } = useStockMovements();
  const { taxRates, loading: taxRatesLoading, error: taxRatesError } = useAllTaxRates();
  const { leases } = useLeases();

  const [actionError, setActionError] = useState<string | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);

  const suppliersMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const supplierName = bill ? suppliersMap.get(bill.supplierId) ?? 'Unknown supplier' : '';
  const sourcePo = bill?.purchaseOrderId ? purchaseOrders.find((po) => po.id === bill.purchaseOrderId) : undefined;
  const relatedLease = bill?.leaseId ? leases.find((l) => l.id === bill.leaseId) : undefined;
  const outstanding = bill ? bill.total - bill.amountPaid : 0;

  const relatedPayments = useMemo(
    () => (bill ? payments.filter((p) => p.allocations.some((a) => a.billId === bill.id)) : []),
    [bill, payments],
  );
  const billMovements = useMemo(
    () =>
      bill
        ? [
            ...movementsForSource(movements, 'bill', bill.id),
            ...(sourcePo ? movementsForSource(movements, 'purchase_order', sourcePo.id) : []),
          ]
        : [],
    [bill, sourcePo, movements],
  );

  const lineColumns = useMemo(
    () =>
      documentLineColumns<Bill['lineItems'][number]>({
        resolveProduct: (id) => {
          const p = id ? productMap.get(id) : undefined;
          return p ? { sku: p.sku, name: p.name } : undefined;
        },
        resolveTaxLabel: (id) => getTaxRateLabel(id, taxRates, { pending: taxRatesLoading || Boolean(taxRatesError) }),
        totalHeader: 'Line total',
      }),
    [productMap, taxRates, taxRatesLoading, taxRatesError],
  );

  const outstandingBills = useMemo(() => bills.filter((b) => b.status !== 'void' && b.total > b.amountPaid), [bills]);

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!bill) return [];
    const items: RelatedRecordItem[] = [
      {
        label: 'Supplier',
        value: <span className="font-medium">{supplierName}</span>,
        onActivate: () => navigate(`/purchases/vendors?record=${bill.supplierId}`),
      },
    ];
    if (sourcePo) {
      items.push({
        label: `Purchase order ${sourcePo.poNumber}`,
        value: <StatusBadge status={sourcePo.status} />,
        onActivate: () => navigate(`/purchases/orders/${sourcePo.id}`),
      });
    }
    if (relatedLease) {
      items.push({
        label: `Lease ${relatedLease.leaseNumber}`,
        value: <span className="text-muted-foreground">{relatedLease.assetDescription}</span>,
        onActivate: () => navigate(`/leases/register?record=${relatedLease.id}`),
      });
    }
    if (bill.journalEntryId) {
      items.push({
        label: 'Journal entry',
        value: <span className="text-muted-foreground">GL posting</span>,
        onActivate: () => navigate(`/accounting/journals?record=${bill.journalEntryId}`),
      });
    }
    for (const p of relatedPayments) {
      const allocated = p.allocations.find((a) => a.billId === bill.id)?.amount ?? 0;
      items.push({
        label: `Payment ${p.paymentNumber}`,
        value: <span className="text-muted-foreground tabular-nums">{formatCurrency(allocated)} applied</span>,
        onActivate: () => navigate(`/purchases/payments/${p.id}`),
      });
    }
    return items;
  }, [bill, supplierName, sourcePo, relatedLease, relatedPayments, navigate]);

  const state = isLoading ? 'loading' : error ? 'error' : bill ? 'ready' : 'not-found';

  async function post() {
    if (!bill) return;
    setActionError(null);
    try {
      await billMutations.postBill(bill.id);
      await refetch();
    } catch (err) {
      setActionError(toAccountingErrorMessage(err, { reference: bill.billNumber, action: 'post this supplier invoice' }));
    }
  }

  const movementsTable =
    billMovements.length > 0 ? (
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
            {billMovements.map((m) => {
              const product = productMap.get(m.productId);
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(m.movementDate ?? m.createdAt)}</td>
                  <td className="px-4 py-2">
                    {product ? <Link className="text-brand hover:underline" to={`/inventory/products/${product.id}`}>{product.sku}</Link> : m.productId}
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
    ) : null;

  const tabs: RecordTab[] = bill
    ? [
        {
          value: 'overview',
          label: 'Overview',
          content: (
            <>
              <RecordPageSection title="Supplier invoice details">
                <RecordSummaryGrid>
                  <RecordField label="Invoice date" value={formatDate(bill.issueDate)} />
                  <RecordField label="Due date" value={formatDate(bill.dueDate)} />
                  <RecordField label="Currency" value={bill.currency} />
                  {sourcePo && (
                    <RecordField
                      label="Source purchase order"
                      value={<Link className="text-brand hover:underline" to={`/purchases/orders/${sourcePo.id}`}>{sourcePo.poNumber}</Link>}
                    />
                  )}
                  {relatedLease && (
                    <RecordField
                      label="Lease"
                      value={<Link className="text-brand hover:underline" to={`/leases/register?record=${relatedLease.id}`}>{relatedLease.leaseNumber}</Link>}
                    />
                  )}
                </RecordSummaryGrid>
              </RecordPageSection>
              {bill.notes && (
                <RecordPageSection title="Notes">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{bill.notes}</p>
                </RecordPageSection>
              )}
            </>
          ),
        },
        {
          value: 'line-items',
          label: 'Line items',
          count: bill.lineItems.length,
          content: (
            <RecordPageSection title="Line items">
              <DocumentLineTable
                columns={lineColumns}
                rows={bill.lineItems}
                rowKey={(l) => l.id}
                minWidthClassName="min-w-[860px]"
                totals={[
                  { label: 'Subtotal', value: formatCurrency(bill.subtotal) },
                  { label: 'VAT (input)', value: formatCurrency(bill.taxTotal) },
                  { label: 'Total', value: formatCurrency(bill.total), emphasis: true },
                  { label: 'Paid', value: formatCurrency(bill.amountPaid) },
                  { label: 'Outstanding', value: formatCurrency(outstanding) },
                ]}
              />
            </RecordPageSection>
          ),
        },
        {
          value: 'payments',
          label: 'Payments',
          count: relatedPayments.length,
          content: (
            <RecordPageSection title="Payments">
              {relatedPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments allocated to this supplier invoice yet. Outstanding balance {formatCurrency(outstanding)}.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                        <th className="px-4 py-2">Payment</th>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Method</th>
                        <th className="px-4 py-2 text-right">Allocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatedPayments.map((p) => (
                        <tr key={p.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-2">
                            <Link className="text-brand hover:underline" to={`/purchases/payments/${p.id}`}>{p.paymentNumber}</Link>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{formatDate(p.date)}</td>
                          <td className="px-4 py-2 text-muted-foreground">{p.method}</td>
                          <td className="figure px-4 py-2 text-right tabular-nums">
                            {formatCurrency(p.allocations.find((a) => a.billId === bill.id)?.amount ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </RecordPageSection>
          ),
        },
        {
          value: 'accounting',
          label: 'Accounting',
          content: (
            <>
              <RecordPageSection title="Posting">
                <RecordSummaryGrid>
                  <RecordField
                    label="Posting state"
                    value={bill.journalEntryId ? 'Posted to the general ledger' : bill.status === 'draft' ? 'Not posted — still a draft' : 'Not posted'}
                  />
                  <RecordField
                    label="Journal entry"
                    value={
                      bill.journalEntryId ? (
                        <Link className="text-brand hover:underline" to={`/accounting/journals?record=${bill.journalEntryId}`}>View journal entry</Link>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <RecordField label="Input VAT" value={formatCurrency(bill.taxTotal)} />
                </RecordSummaryGrid>
              </RecordPageSection>
              {movementsTable && (
                <RecordPageSection title="Inventory movements">
                  {movementsTable}
                  {sourcePo && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Movements from the source purchase order {sourcePo.poNumber} are shown here — a linked supplier invoice clears GRNI rather than re-recording stock.
                    </p>
                  )}
                </RecordPageSection>
              )}
            </>
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
            <RecordActivitySection recordType="Bill" recordId={bill.id} title="Record activity" subtitle="Changes and lifecycle events for this supplier invoice." />
          ),
        },
      ]
    : [];

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Purchases' }, { label: 'Supplier invoices', to: '/purchases/bills' }, { label: bill?.billNumber ?? 'Supplier invoice' }]}
      backTo="/purchases/bills"
      backLabel="Supplier invoices"
      embedded={embedded}
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This supplier invoice could not be found — it may have been deleted."
    >
      {bill && (
        <>
          <RecordPageHeader
            recordNumber={bill.billNumber}
            title={supplierName}
            meta={`Invoice date ${formatDate(bill.issueDate)} · due ${formatDate(bill.dueDate)}`}
            status={<StatusBadge status={bill.status} />}
            actions={
              <RecordActionBar
                busy={billMutations.isLoading}
                primary={
                  bill.status === 'draft'
                    ? { label: 'Post supplier invoice', onClick: () => void post() }
                    : bill.status !== 'void' && outstanding > 0.01
                      ? { label: 'Record payment', onClick: () => setRecordingPayment(true) }
                      : undefined
                }
              />
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <StatStrip columns={4}>
            <StatTile variant="compact" icon={ReceiptTextIcon} label="Total" value={formatCurrency(bill.total)} />
            <StatTile variant="compact" icon={WalletIcon} label="Paid" value={formatCurrency(bill.amountPaid)} tone={bill.amountPaid > 0 ? 'positive' : 'default'} />
            <StatTile variant="compact"
              icon={BanknoteIcon}
              label="Outstanding"
              value={formatCurrency(outstanding)}
              tone={outstanding > 0.01 && bill.status !== 'void' ? 'warning' : 'default'}
            />
            <StatTile variant="compact" icon={PackageIcon} label="Input VAT" value={formatCurrency(bill.taxTotal)} />
          </StatStrip>

          <RecordTabs urlParam="tab" embedded={embedded} ariaLabel="Supplier invoice sections" tabs={tabs} />

          {recordingPayment && (
            <PaymentFormModal
              title={`Record payment — ${bill.billNumber}`}
              suppliers={suppliers}
              outstandingBills={outstandingBills}
              defaultPaymentNumber={nextDocumentNumber(payments.map((p) => p.paymentNumber), 'PAY')}
              presetBillId={bill.id}
              onSubmit={async (data) => {
                await createPayment(data);
                await Promise.all([refetchPayments(), refetch()]);
                setRecordingPayment(false);
              }}
              onClose={() => setRecordingPayment(false)}
            />
          )}
        </>
      )}
    </RecordPageShell>
  );
}
