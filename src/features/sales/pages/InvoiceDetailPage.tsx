import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PencilIcon, PrinterIcon } from 'lucide-react';
import type { Invoice } from '@/types';
import { BusinessDocumentPreviewModal, useBusinessDocument } from '@/features/businessDocuments';
import type { RecordAction } from '@/components/app/record-page';
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
  RelatedRecordsSection,
  type RelatedRecordItem,
  type RecordPageProps,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/app/form';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { getTaxRateLabel, MOVEMENT_TYPE_LABELS } from '@/features/inventory/constants';
import { useInvoices, useInvoiceMutations } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { InvoiceFormModal } from '@/features/sales/components/InvoiceFormModal';
import { CustomerReceiptFormModal } from '@/features/sales/components/CustomerReceiptFormModal';
import { ApplyDepositFormModal } from '@/features/sales/components/ApplyDepositForm';
import { invoiceService } from '@/services';

/**
 * Full-page Invoice detail — route `/sales/invoices/:invoiceId`. Replaces
 * the ~450px right-hand sheet: line items get the real page width (SKU,
 * description, tax rate, tax, total all visible at once), and the invoice's
 * whole accounting story is on one page — receipts and outstanding balance,
 * credit notes raised against it, stock movements for its inventory lines,
 * the GL posting, and (when it came from one) the source sales order.
 *
 * No accounting behaviour changes: the same
 * invoiceService.markInvoiceAsSent()/deleteInvoice()/updateInvoice() calls,
 * the same posted-invoice immutability (edit is draft-only).
 */
export function InvoiceDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = recordId ?? params.invoiceId;
  const navigate = useNavigate();

  const { invoices, loading, error, refetch } = useInvoices();
  const invoice = invoices.find((inv) => inv.id === invoiceId);

  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { creditNotes } = useCreditNotes();
  const { receipts, refetch: refetchReceipts } = useCustomerReceipts();
  const { recordReceipt, allocateToInvoice } = useCustomerReceiptMutations();
  const { salesOrders } = useSalesOrders();
  const { company } = useCompany();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { movements } = useStockMovements();
  const { taxRates, loading: taxRatesLoading, error: taxRatesError } = useAllTaxRates();

  const canUpdate = useCanAccess('invoicing', 'update');
  const canDelete = useCanAccess('invoicing', 'delete');

  const { updateInvoice, deleteInvoice, markInvoiceAsSent, copyInvoice, saving } = useInvoiceMutations();

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [applyingDeposit, setApplyingDeposit] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { viewModel, loading: docLoading, error: docError } = useBusinessDocument({ kind: 'invoice', record: invoice });

  const customerName = invoice ? customerMap.get(invoice.customerId) || 'Unknown customer' : '';
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);

  const relatedCreditNotes = useMemo(
    () => (invoice ? creditNotes.filter((cn) => cn.invoiceId === invoice.id) : []),
    [invoice, creditNotes],
  );
  const relatedReceipts = useMemo(
    () => (invoice ? receipts.filter((r) => r.allocations.some((a) => a.invoiceId === invoice.id)) : []),
    [invoice, receipts],
  );
  const sourceOrder = invoice?.salesOrderId
    ? salesOrders.find((o) => o.id === invoice.salesOrderId)
    : undefined;
  const invoiceMovements = useMemo(
    () =>
      invoice
        ? movements.filter((m) => m.sourceDocumentType === 'invoice' && m.sourceDocumentId === invoice.id)
        : [],
    [invoice, movements],
  );

  const lineColumns = useMemo(
    () =>
      documentLineColumns<Invoice['lineItems'][number]>({
        resolveProduct: (id) => {
          const p = id ? productMap.get(id) : undefined;
          return p ? { sku: p.sku, name: p.name } : undefined;
        },
        resolveTaxLabel: (id) => getTaxRateLabel(id, taxRates, { pending: taxRatesLoading || Boolean(taxRatesError) }),
        totalHeader: 'Line total',
      }),
    [productMap, taxRates, taxRatesLoading, taxRatesError],
  );

  const outstanding = invoice ? invoice.total - invoice.amountPaid : 0;

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!invoice) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    if (sourceOrder) {
      items.push({
        label: 'Source sales order',
        value: <Link className="font-medium text-brand hover:underline" to={`/sales/orders/${sourceOrder.id}`}>{sourceOrder.orderNumber}</Link>,
      });
    }
    if (invoice.journalEntryId) {
      items.push({
        label: 'GL posting',
        value: <Link className="font-medium text-brand hover:underline" to={`/accounting/journals?record=${invoice.journalEntryId}`}>View journal entry</Link>,
      });
    }
    for (const cn of relatedCreditNotes) {
      items.push({
        label: 'Credit note',
        value: <Link className="font-medium text-brand hover:underline" to={`/sales/credit-notes/${cn.id}`}>{cn.creditNoteNumber}</Link>,
      });
    }
    for (const receipt of relatedReceipts) {
      const allocated = receipt.allocations.find((a) => a.invoiceId === invoice.id)?.amount ?? 0;
      items.push({
        label: 'Receipt',
        value: (
          <Link className="font-medium text-brand hover:underline" to={`/sales/receipts/${receipt.id}`}>
            {receipt.receiptNumber} ({formatCurrency(allocated)})
          </Link>
        ),
      });
    }
    return items;
  }, [invoice, customerName, sourceOrder, relatedCreditNotes, relatedReceipts]);

  async function act(fn: () => Promise<unknown>, after: () => void) {
    setActionError(null);
    try {
      await fn();
      after();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this invoice.');
    }
  }

  const state = loading ? 'loading' : error ? 'error' : invoice ? 'ready' : 'not-found';
  const overdue = invoice ? invoiceService.isOverdue(invoice) : false;
  const canRecordPayment = invoice != null && invoice.status !== 'paid' && invoice.status !== 'draft' && invoice.status !== 'void' && outstanding > 0.01;
  const customerDepositReceipts = useMemo(
    () => (invoice ? receipts.filter((r) => r.customerId === invoice.customerId && r.unallocatedAmount > 0.01) : []),
    [invoice, receipts],
  );
  const availableDeposit = customerDepositReceipts.reduce((sum, r) => sum + r.unallocatedAmount, 0);
  const canApplyDeposit = canRecordPayment && availableDeposit > 0.01;

  const secondaryActions: RecordAction[] = invoice
    ? [
        { label: 'Print / PDF', icon: PrinterIcon, onClick: () => setPreviewOpen(true) },
        {
          label: 'Duplicate',
          onClick: () =>
            void act(
              () =>
                copyInvoice(invoice.id).then((copy) => {
                  if (copy?.id) navigate(`/sales/invoices/${copy.id}`);
                }),
              () => {},
            ),
        },
        ...(invoice.status === 'draft' && canUpdate
          ? [{ label: 'Edit', icon: PencilIcon, onClick: () => setEditing(true) }]
          : canApplyDeposit
            ? [{ label: `Apply deposit (${formatCurrency(availableDeposit)})`, onClick: () => setApplyingDeposit(true) }]
            : []),
      ]
    : [];

  return (
    <RecordPageShell
      breadcrumbs={[
        { label: 'Sales' },
        { label: 'Invoices', to: '/sales/invoices' },
        { label: invoice?.invoiceNumber ?? 'Invoice' },
      ]}
      backTo="/sales/invoices"
      backLabel="Invoices"
      embedded={embedded}
      state={state}
      errorMessage={error ?? undefined}
      notFoundMessage="This invoice could not be found — it may have been deleted."
    >
      {invoice && (
        <>
          <RecordPageHeader
            recordNumber={invoice.invoiceNumber}
            title={customerName}
            meta={`Issued ${formatDate(invoice.issueDate)} · due ${formatDate(invoice.dueDate)}${overdue && invoice.status !== 'paid' && invoice.status !== 'void' ? ' · past due' : ''}`}
            status={<StatusBadge status={invoice.status} />}
            actions={
              <RecordActionBar
                busy={saving}
                primary={
                  invoice.status === 'draft' && canUpdate
                    ? { label: 'Mark as sent', onClick: () => void act(() => markInvoiceAsSent(invoice.id).then(() => refetch()), () => {}) }
                    : canRecordPayment
                      ? { label: 'Record payment', onClick: () => setRecordingPayment(true) }
                      : undefined
                }
                secondary={secondaryActions}
                danger={
                  invoice.status === 'draft' && canDelete
                    ? [{ label: 'Delete draft', onClick: () => setConfirmDelete(true) }]
                    : []
                }
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
              <RecordField label="Issue date" value={formatDate(invoice.issueDate)} />
              <RecordField label="Due date" value={formatDate(invoice.dueDate)} />
              <RecordField label="Status" value={<StatusBadge status={invoice.status} />} />
              <RecordField label="Currency" value={invoice.currency} />
              {sourceOrder && <RecordField label="Source sales order" value={sourceOrder.orderNumber} />}
              {company?.vatRegistrationNumber && <RecordField label="VAT reg. no." value={company.vatRegistrationNumber} />}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Line items">
            <DocumentLineTable
              columns={lineColumns}
              rows={invoice.lineItems}
              rowKey={(l) => l.id}
              minWidthClassName="min-w-[860px]"
              totals={[
                { label: 'Subtotal', value: formatCurrency(invoice.subtotal) },
                { label: 'VAT', value: formatCurrency(invoice.taxTotal) },
                { label: 'Total', value: formatCurrency(invoice.total), emphasis: true },
                { label: 'Paid', value: formatCurrency(invoice.amountPaid) },
                { label: 'Outstanding', value: formatCurrency(outstanding) },
              ]}
            />
          </RecordPageSection>

          <RecordPageSection title="Payments & receipts">
            {relatedReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No receipts allocated to this invoice yet. Outstanding balance {formatCurrency(outstanding)}.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="px-4 py-2">Receipt</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2 text-right">Allocated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedReceipts.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <Link className="text-brand hover:underline" to={`/sales/receipts/${r.id}`}>{r.receiptNumber}</Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDate(r.date)}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.method}</td>
                        <td className="figure px-4 py-2 text-right tabular-nums">
                          {formatCurrency(r.allocations.find((a) => a.invoiceId === invoice.id)?.amount ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </RecordPageSection>

          {relatedCreditNotes.length > 0 && (
            <RecordPageSection title="Credit notes">
              <div className="flex flex-col gap-1.5">
                {relatedCreditNotes.map((cn) => (
                  <div key={cn.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
                    <Link className="text-brand hover:underline" to={`/sales/credit-notes/${cn.id}`}>{cn.creditNoteNumber}</Link>
                    <span className="flex items-center gap-3">
                      <StatusBadge status={cn.status} />
                      <span className="figure tabular-nums">{formatCurrency(cn.total)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </RecordPageSection>
          )}

          {invoiceMovements.length > 0 && (
            <RecordPageSection title="Stock movements">
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
                    {invoiceMovements.map((m) => {
                      const product = productMap.get(m.productId);
                      return (
                        <tr key={m.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-2 text-muted-foreground">{formatDate(m.movementDate ?? m.createdAt)}</td>
                          <td className="px-4 py-2">
                            {product ? (
                              <Link className="text-brand hover:underline" to={`/inventory/products/${product.id}`}>{product.sku}</Link>
                            ) : (
                              m.productId
                            )}
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
            </RecordPageSection>
          )}

          <RecordPageSection title="Accounting">
            <RecordSummaryGrid>
              <RecordField
                label="Posting state"
                value={invoice.journalEntryId ? 'Posted to the general ledger' : invoice.status === 'draft' ? 'Not posted — still a draft' : 'Not posted'}
              />
              <RecordField
                label="Journal entry"
                value={
                  invoice.journalEntryId ? (
                    <Link className="text-brand hover:underline" to={`/accounting/journals?record=${invoice.journalEntryId}`}>View journal entry</Link>
                  ) : (
                    '—'
                  )
                }
              />
              <RecordField label="Output VAT" value={formatCurrency(invoice.taxTotal)} />
            </RecordSummaryGrid>
            {invoice.status !== 'draft' && (
              <p className="mt-3 text-xs text-muted-foreground">
                This invoice has posted to the ledger — its lines and amounts can no longer be edited here. Issue a{' '}
                <Link className="text-brand hover:underline" to="/sales/credit-notes">credit note</Link> to adjust it.
              </p>
            )}
          </RecordPageSection>

          {invoice.notes && (
            <RecordPageSection title="Notes">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
            </RecordPageSection>
          )}

          <RelatedRecordsSection items={relatedItems} />

          <RecordActivitySection
            recordType="Invoice"
            recordId={invoice.id}
            title="Record activity"
            subtitle="Changes and lifecycle events for this invoice."
          />

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete ${invoice.invoiceNumber}?`}
            description="This permanently removes the draft invoice. A posted invoice can never be deleted this way — issue a credit note instead."
            confirmLabel="Delete draft"
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              void act(() => deleteInvoice(invoice.id), () => navigate('/sales/invoices'));
            }}
          />

          {editing && (
            <InvoiceFormModal
              title={`Edit ${invoice.invoiceNumber}`}
              invoice={invoice}
              customers={new Map(customerList.map((c) => [c.id, c.name]))}
              onSubmit={async (values) => {
                await updateInvoice(invoice.id, values);
                setEditing(false);
                void refetch();
              }}
              onClose={() => setEditing(false)}
              isLoading={saving}
            />
          )}

          {recordingPayment && (
            <CustomerReceiptFormModal
              title={`Record payment — ${invoice.invoiceNumber}`}
              customers={customerList}
              invoices={invoices}
              defaultReceiptNumber={`RCT-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(4, '0')}`}
              presetInvoiceId={invoice.id}
              onSubmit={async (data) => {
                await recordReceipt(data);
                await refetchReceipts();
                setRecordingPayment(false);
                void refetch();
              }}
              onClose={() => setRecordingPayment(false)}
            />
          )}

          <BusinessDocumentPreviewModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            viewModel={viewModel}
            loading={docLoading}
            error={docError}
          />

          {applyingDeposit && (
            <ApplyDepositFormModal
              title={`Apply deposit — ${invoice.invoiceNumber}`}
              receipts={customerDepositReceipts}
              invoiceOutstanding={outstanding}
              onSubmit={async (receiptId, amount, allocationId) => {
                await allocateToInvoice(receiptId, invoice.id, amount, allocationId);
                await refetchReceipts();
                setApplyingDeposit(false);
                void refetch();
              }}
              onClose={() => setApplyingDeposit(false)}
            />
          )}
        </>
      )}
    </RecordPageShell>
  );
}
