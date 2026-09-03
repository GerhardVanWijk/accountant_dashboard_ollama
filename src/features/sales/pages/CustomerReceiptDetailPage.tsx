import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  RecordActionBar,
  RecordActivitySection,
  RecordField,
  RecordPageHeader,
  RecordPageSection,
  RecordPageShell,
  RecordSummaryGrid,
  RelatedRecordsSection,
  type RelatedRecordItem,
} from '@/components/app/record-page';
import { StatusBadge } from '@/components/app/status-badge';
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { receiptAllocationState } from '@/features/sales/utils/receiptAllocationState';
import { AllocationFormModal, type OpenInvoiceOption } from '@/features/sales/components/AllocationFormModal';

const METHOD_LABELS: Record<string, string> = {
  eft: 'EFT', cash: 'Cash', card: 'Card', cheque: 'Cheque', other: 'Other',
};
const EPSILON = 0.01;

/**
 * Full-page Customer Receipt detail — route `/sales/receipts/:receiptId`.
 * Makes allocation far clearer than the old sheet: a proper
 * Document / Original amount / Allocated / Remaining table, an
 * on-account summary, and clickable links to every invoice the receipt
 * touched. Same customerReceiptService.allocateToInvoice() call as before —
 * allocation logic unchanged.
 */
export function CustomerReceiptDetailPage() {
  const { receiptId } = useParams<{ receiptId: string }>();

  const { receipts, isLoading, error, refetch } = useCustomerReceipts();
  const receipt = receipts.find((r) => r.id === receiptId);
  const { invoices, refetch: refetchInvoices } = useInvoices();
  const { customers: customerMap } = useCustomerMap();

  const { allocateToInvoice, isLoading: isBusy } = useCustomerReceiptMutations({ onSuccess: () => refetch() });

  const [actionError, setActionError] = useState<string | null>(null);
  const [allocating, setAllocating] = useState(false);

  const customerName = receipt ? customerMap.get(receipt.customerId) || 'Unknown customer' : '';
  const invoiceById = useMemo(() => new Map(invoices.map((inv) => [inv.id, inv])), [invoices]);
  const allocated = receipt ? receipt.amount - receipt.unallocatedAmount : 0;

  const openInvoiceOptions: OpenInvoiceOption[] = receipt
    ? invoices
        .filter((inv) => inv.customerId === receipt.customerId && inv.total - inv.amountPaid > EPSILON)
        .map((inv) => ({ invoice: inv, outstanding: inv.total - inv.amountPaid }))
    : [];

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!receipt) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    for (const a of receipt.allocations) {
      const inv = invoiceById.get(a.invoiceId);
      if (!inv) continue;
      items.push({
        label: 'Applied to invoice',
        value: (
          <Link className="font-medium text-brand hover:underline" to={`/sales/invoices/${inv.id}`}>
            {inv.invoiceNumber} ({formatCurrency(a.amount)})
          </Link>
        ),
      });
    }
    if (receipt.journalEntryId) {
      items.push({
        label: 'GL posting',
        value: <Link className="font-medium text-brand hover:underline" to={`/accounting/journals?record=${receipt.journalEntryId}`}>View journal entry</Link>,
      });
    }
    if (receipt.bankAccountId) {
      items.push({ label: 'Bank account', value: <Link className="font-medium text-brand hover:underline" to="/banking/accounts">View bank account</Link> });
    }
    return items;
  }, [receipt, customerName, invoiceById]);

  const state = isLoading ? 'loading' : error ? 'error' : receipt ? 'ready' : 'not-found';
  const canAllocate = receipt != null && receipt.unallocatedAmount > EPSILON;

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Sales' }, { label: 'Payments', to: '/sales/receipts' }, { label: receipt?.receiptNumber ?? 'Receipt' }]}
      backTo="/sales/receipts"
      backLabel="Payments"
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This receipt could not be found — it may have been deleted."
    >
      {receipt && (
        <>
          <RecordPageHeader
            recordNumber={receipt.receiptNumber}
            title={customerName}
            meta={`Received ${formatDate(receipt.date)} · ${METHOD_LABELS[receipt.method] ?? receipt.method}`}
            status={<StatusBadge status={receiptAllocationState(receipt)} />}
            actions={
              <RecordActionBar
                busy={isBusy}
                primary={canAllocate ? { label: 'Allocate to invoice', onClick: () => setAllocating(true) } : undefined}
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
              <RecordField label="Date received" value={formatDate(receipt.date)} />
              <RecordField label="Method" value={METHOD_LABELS[receipt.method] ?? receipt.method} />
              {receipt.reference && <RecordField label="Reference" value={receipt.reference} />}
              <RecordField label="Allocation status" value={<StatusBadge status={receiptAllocationState(receipt)} />} />
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Summary">
            <RecordSummaryGrid>
              <RecordField label="Amount received" value={formatCurrency(receipt.amount)} />
              <RecordField label="Allocated" value={formatCurrency(allocated)} />
              <RecordField label="On account / unallocated" value={formatCurrency(receipt.unallocatedAmount)} />
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Allocations">
            {receipt.allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No allocations yet — this receipt is entirely on account.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="px-4 py-2">Document</th>
                      <th className="px-4 py-2 text-right">Original amount</th>
                      <th className="px-4 py-2 text-right">Allocated</th>
                      <th className="px-4 py-2 text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.allocations.map((a, i) => {
                      const inv = invoiceById.get(a.invoiceId);
                      return (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-4 py-2">
                            {inv ? (
                              <Link className="text-brand hover:underline" to={`/sales/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                            ) : (
                              a.invoiceId
                            )}
                          </td>
                          <td className="figure px-4 py-2 text-right tabular-nums">{inv ? formatCurrency(inv.total) : '—'}</td>
                          <td className="figure px-4 py-2 text-right tabular-nums">{formatCurrency(a.amount)}</td>
                          <td className="figure px-4 py-2 text-right tabular-nums">{inv ? formatCurrency(inv.total - inv.amountPaid) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </RecordPageSection>

          {receipt.notes && (
            <RecordPageSection title="Notes">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{receipt.notes}</p>
            </RecordPageSection>
          )}

          <RelatedRecordsSection items={relatedItems} />

          <RecordActivitySection recordType="CustomerReceipt" recordId={receipt.id} title="Record activity" subtitle="Changes and lifecycle events for this receipt." />

          {allocating && (
            <AllocationFormModal
              title={`Allocate ${receipt.receiptNumber}`}
              openInvoices={openInvoiceOptions}
              maxAmount={receipt.unallocatedAmount}
              onSubmit={async (invoiceId, amount) => {
                setActionError(null);
                try {
                  await allocateToInvoice(receipt.id, invoiceId, amount);
                  await refetchInvoices();
                  setAllocating(false);
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : 'Could not allocate this receipt.');
                }
              }}
              onClose={() => setAllocating(false)}
            />
          )}
        </>
      )}
    </RecordPageShell>
  );
}
