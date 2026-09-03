import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CreditNote } from '@/types';
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
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCreditNoteMutations } from '@/features/sales/hooks/useCreditNoteMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';
import { useStockMovements } from '@/features/inventory/hooks/useStockMovements';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';
import { AllocationFormModal, type OpenInvoiceOption } from '@/features/sales/components/AllocationFormModal';

const REASON_LABELS: Record<string, string> = {
  return: 'Returned goods',
  pricing_error: 'Pricing error',
  discount: 'Discount',
  other: 'Other',
};
const EPSILON = 0.01;

/**
 * Full-page Credit Note detail — route `/sales/credit-notes/:creditNoteId`.
 * Shows the whole contra-document story on one page: the original invoice
 * it credits (credit_notes.invoice_id, a real FK), the reason + reason
 * detail (migration 0043), line items, allocation ledger, any inventory
 * restock movements, and the reversing journal entry. Same
 * creditNoteService.issueCreditNote()/voidCreditNote()/allocateToInvoice()
 * calls as before — accounting unchanged.
 */
export function CreditNoteDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ creditNoteId: string }>();
  const creditNoteId = recordId ?? params.creditNoteId;

  const { creditNotes, isLoading, error, refetch } = useCreditNotes();
  const creditNote = creditNotes.find((cn) => cn.id === creditNoteId);
  const { invoices, refetch: refetchInvoices } = useInvoices();
  const { customers: customerMap } = useCustomerMap();
  const { company } = useCompany();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { movements } = useStockMovements();
  const { taxRates, loading: taxRatesLoading, error: taxRatesError } = useAllTaxRates();

  const {
    issueCreditNote, voidCreditNote, allocateToInvoice, isLoading: isBusy,
  } = useCreditNoteMutations({ onSuccess: () => refetch() });

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [allocating, setAllocating] = useState(false);

  const customerName = creditNote ? customerMap.get(creditNote.customerId) || 'Unknown customer' : '';
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const invoiceNumbers = useMemo(() => new Map(invoices.map((inv) => [inv.id, inv.invoiceNumber])), [invoices]);

  const linkedInvoice = creditNote?.invoiceId ? invoices.find((inv) => inv.id === creditNote.invoiceId) : undefined;
  const remaining = creditNote ? creditNote.total - creditNote.amountAllocated : 0;

  const cnMovements = useMemo(
    () =>
      creditNote
        ? movements.filter((m) => m.sourceDocumentType === 'credit_note' && m.sourceDocumentId === creditNote.id)
        : [],
    [creditNote, movements],
  );

  const lineColumns = useMemo(
    () =>
      documentLineColumns<CreditNote['lineItems'][number]>({
        resolveProduct: (id) => {
          const p = id ? productMap.get(id) : undefined;
          return p ? { sku: p.sku, name: p.name } : undefined;
        },
        resolveTaxLabel: (id) => getTaxRateLabel(id, taxRates, { pending: taxRatesLoading || Boolean(taxRatesError) }),
        totalHeader: 'Credit',
      }),
    [productMap, taxRates, taxRatesLoading, taxRatesError],
  );

  const openInvoiceOptions: OpenInvoiceOption[] = creditNote
    ? invoices
        .filter((inv) => inv.customerId === creditNote.customerId && inv.total - inv.amountPaid > EPSILON)
        .map((inv) => ({ invoice: inv, outstanding: inv.total - inv.amountPaid }))
    : [];

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!creditNote) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    if (linkedInvoice) {
      items.push({
        label: 'Original invoice',
        value: <Link className="font-medium text-brand hover:underline" to={`/sales/invoices/${linkedInvoice.id}`}>{linkedInvoice.invoiceNumber}</Link>,
      });
    }
    if (creditNote.journalEntryId) {
      items.push({
        label: 'GL posting',
        value: <Link className="font-medium text-brand hover:underline" to={`/accounting/journals?record=${creditNote.journalEntryId}`}>View journal entry</Link>,
      });
    }
    return items;
  }, [creditNote, customerName, linkedInvoice]);

  async function act(fn: () => Promise<unknown>, after: () => void = () => {}) {
    setActionError(null);
    try {
      await fn();
      after();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this credit note.');
    }
  }

  const state = isLoading ? 'loading' : error ? 'error' : creditNote ? 'ready' : 'not-found';
  const canAllocate = creditNote != null && (creditNote.status === 'issued' || creditNote.status === 'allocated') && remaining > EPSILON;

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Sales' }, { label: 'Credit notes', to: '/sales/credit-notes' }, { label: creditNote?.creditNoteNumber ?? 'Credit note' }]}
      backTo="/sales/credit-notes"
      backLabel="Credit notes"
      embedded={embedded}
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This credit note could not be found — it may have been deleted."
    >
      {creditNote && (
        <>
          <RecordPageHeader
            recordNumber={creditNote.creditNoteNumber}
            title={customerName}
            meta={linkedInvoice ? `Against invoice ${linkedInvoice.invoiceNumber} · issued ${formatDate(creditNote.issueDate)}` : `Standalone account credit · issued ${formatDate(creditNote.issueDate)}`}
            status={<StatusBadge status={creditNote.status} />}
            actions={
              <RecordActionBar
                busy={isBusy}
                primary={canAllocate ? { label: 'Allocate to invoice', onClick: () => setAllocating(true) } : undefined}
                secondary={creditNote.status === 'draft' ? [{ label: 'Issue credit note', onClick: () => void act(() => issueCreditNote(creditNote.id)) }] : []}
                danger={creditNote.status === 'draft' ? [{ label: 'Void', onClick: () => setConfirmVoid(true) }] : []}
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
              <RecordField label="Issue date" value={formatDate(creditNote.issueDate)} />
              <RecordField label="Reason" value={REASON_LABELS[creditNote.reason] ?? creditNote.reason} />
              <RecordField label="Status" value={<StatusBadge status={creditNote.status} />} />
              <RecordField label="Currency" value={creditNote.currency} />
              <RecordField
                label="Original invoice"
                value={
                  linkedInvoice ? (
                    <Link className="text-brand hover:underline" to={`/sales/invoices/${linkedInvoice.id}`}>{linkedInvoice.invoiceNumber}</Link>
                  ) : (
                    'Standalone account credit'
                  )
                }
              />
              {creditNote.reasonDetails && (
                <RecordField label="Reason detail" value={<span className="whitespace-pre-wrap">{creditNote.reasonDetails}</span>} className="sm:col-span-2 lg:col-span-3" />
              )}
              {company?.vatRegistrationNumber && <RecordField label="VAT reg. no." value={company.vatRegistrationNumber} />}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Line items">
            <DocumentLineTable
              columns={lineColumns}
              rows={creditNote.lineItems}
              rowKey={(l) => l.id}
              minWidthClassName="min-w-[860px]"
              totals={[
                { label: 'Subtotal', value: formatCurrency(creditNote.subtotal) },
                { label: 'VAT reversed', value: formatCurrency(creditNote.taxTotal) },
                { label: 'Total credit', value: formatCurrency(creditNote.total), emphasis: true },
              ]}
            />
            {creditNote.lineItems.some((l) => l.originalInvoiceLineId) && (
              <p className="mt-2 text-xs text-muted-foreground">
                Line credits are matched to specific lines on {linkedInvoice?.invoiceNumber ?? 'the original invoice'} — the return quantity is validated against that line (Phase 9B).
              </p>
            )}
          </RecordPageSection>

          <RecordPageSection title="Allocation status">
            <RecordSummaryGrid>
              <RecordField label="Allocated" value={formatCurrency(creditNote.amountAllocated)} />
              <RecordField label="Remaining" value={formatCurrency(remaining)} />
            </RecordSummaryGrid>
            {creditNote.allocations.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">Allocated on</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditNote.allocations.map((a, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          {invoiceNumbers.has(a.invoiceId) ? (
                            <Link className="text-brand hover:underline" to={`/sales/invoices/${a.invoiceId}`}>{invoiceNumbers.get(a.invoiceId)}</Link>
                          ) : (
                            a.invoiceId
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{formatDate(a.allocatedAt)}</td>
                        <td className="figure px-4 py-2 text-right tabular-nums">{formatCurrency(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </RecordPageSection>

          {cnMovements.length > 0 && (
            <RecordPageSection title="Inventory restock">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Warehouse</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cnMovements.map((m) => {
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
                value={creditNote.journalEntryId ? 'Posted to the general ledger' : creditNote.status === 'draft' ? 'Not posted — still a draft' : 'Not posted'}
              />
              <RecordField
                label="Journal entry"
                value={
                  creditNote.journalEntryId ? (
                    <Link className="text-brand hover:underline" to={`/accounting/journals?record=${creditNote.journalEntryId}`}>View journal entry</Link>
                  ) : (
                    '—'
                  )
                }
              />
              <RecordField label="Output VAT reversed" value={formatCurrency(creditNote.taxTotal)} />
            </RecordSummaryGrid>
          </RecordPageSection>

          {creditNote.notes && (
            <RecordPageSection title="Notes">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{creditNote.notes}</p>
            </RecordPageSection>
          )}

          <RelatedRecordsSection items={relatedItems} />

          <RecordActivitySection recordType="CreditNote" recordId={creditNote.id} title="Record activity" subtitle="Changes and lifecycle events for this credit note." />

          <ConfirmDialog
            open={confirmVoid}
            onOpenChange={setConfirmVoid}
            title={`Void ${creditNote.creditNoteNumber}?`}
            description="This marks the draft credit note as void. This cannot be undone."
            confirmLabel="Void credit note"
            destructive
            onConfirm={() => {
              setConfirmVoid(false);
              void act(() => voidCreditNote(creditNote.id));
            }}
          />

          {allocating && (
            <AllocationFormModal
              title={`Allocate ${creditNote.creditNoteNumber}`}
              openInvoices={openInvoiceOptions}
              maxAmount={remaining}
              onSubmit={async (invoiceId, amount) => {
                await act(() => allocateToInvoice(creditNote.id, invoiceId, amount).then(() => refetchInvoices()));
                setAllocating(false);
              }}
              onClose={() => setAllocating(false)}
            />
          )}
        </>
      )}
    </RecordPageShell>
  );
}
