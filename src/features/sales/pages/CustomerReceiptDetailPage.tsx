import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BanknoteIcon, PiggyBankIcon, WalletIcon } from 'lucide-react';
import {
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
 * Full-page Customer Receipt detail — route `/sales/receipts/:receiptId`. A
 * tabbed workspace: Overview, Allocations (which customer invoices the money
 * was applied to), Accounting (bank / AR or Customer Deposits / journal),
 * Related records, Activity. Same customerReceiptService.allocateToInvoice()
 * call as before — allocation logic unchanged.
 */
export function CustomerReceiptDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ receiptId: string }>();
  const receiptId = recordId ?? params.receiptId;
  const navigate = useNavigate();

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
      {
        label: 'Customer',
        value: <span className="font-medium">{customerName}</span>,
        onActivate: () => navigate(`/sales/customers?record=${receipt.customerId}`),
      },
    ];
    for (const a of receipt.allocations) {
      const inv = invoiceById.get(a.invoiceId);
      if (!inv) continue;
      items.push({
        label: `Invoice ${inv.invoiceNumber}`,
        value: <span className="text-muted-foreground tabular-nums">{formatCurrency(a.amount)} applied</span>,
        onActivate: () => navigate(`/sales/invoices/${inv.id}`),
      });
    }
    if (receipt.journalEntryId) {
      items.push({
        label: 'Journal entry',
        value: <span className="text-muted-foreground">GL posting</span>,
        onActivate: () => navigate(`/accounting/journals?record=${receipt.journalEntryId}`),
      });
    }
    if (receipt.bankAccountId) {
      items.push({
        label: 'Bank account',
        value: <span className="text-muted-foreground">Deposited to</span>,
        onActivate: () => navigate(`/banking/accounts?record=${receipt.bankAccountId}`),
      });
    }
    return items;
  }, [receipt, customerName, invoiceById, navigate]);

  const state = isLoading ? 'loading' : error ? 'error' : receipt ? 'ready' : 'not-found';
  const canAllocate = receipt != null && receipt.unallocatedAmount > EPSILON;

  const tabs: RecordTab[] = receipt
    ? [
        {
          value: 'overview',
          label: 'Overview',
          content: (
            <>
              <RecordPageSection title="Receipt details">
                <RecordSummaryGrid>
                  <RecordField label="Date received" value={formatDate(receipt.date)} />
                  <RecordField label="Method" value={METHOD_LABELS[receipt.method] ?? receipt.method} />
                  {receipt.reference && <RecordField label="Reference" value={receipt.reference} />}
                </RecordSummaryGrid>
              </RecordPageSection>
              {receipt.notes && (
                <RecordPageSection title="Notes">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{receipt.notes}</p>
                </RecordPageSection>
              )}
            </>
          ),
        },
        {
          value: 'allocations',
          label: 'Allocations',
          count: receipt.allocations.length,
          content: (
            <RecordPageSection title="Allocations">
              {receipt.allocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has been applied — this receipt is held entirely as a customer deposit.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                        <th className="px-4 py-2">Customer invoice</th>
                        <th className="px-4 py-2 text-right">Invoice total</th>
                        <th className="px-4 py-2 text-right">Allocated</th>
                        <th className="px-4 py-2 text-right">Still outstanding</th>
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
          ),
        },
        {
          value: 'accounting',
          label: 'Accounting',
          content: (
            <RecordPageSection title="Posting">
              <RecordSummaryGrid>
                <RecordField label="Amount received" value={formatCurrency(receipt.amount)} />
                <RecordField label="Cash / bank" value={receipt.bankAccountId ? 'Deposited to a bank account' : 'Cash / other'} />
                <RecordField label="Applied to receivables" value={formatCurrency(allocated)} />
                <RecordField
                  label="Held as customer deposit"
                  value={
                    <>
                      {formatCurrency(receipt.unallocatedAmount)}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        In the Customer Deposits liability account until applied to an invoice
                      </span>
                    </>
                  }
                />
                <RecordField
                  label="Journal entry"
                  value={
                    receipt.journalEntryId ? (
                      <Link className="text-brand hover:underline" to={`/accounting/journals?record=${receipt.journalEntryId}`}>View journal entry</Link>
                    ) : (
                      '—'
                    )
                  }
                />
              </RecordSummaryGrid>
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
            <RecordActivitySection recordType="CustomerReceipt" recordId={receipt.id} title="Record activity" subtitle="Changes and lifecycle events for this receipt." />
          ),
        },
      ]
    : [];

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Sales' }, { label: 'Customer receipts', to: '/sales/receipts' }, { label: receipt?.receiptNumber ?? 'Customer receipt' }]}
      backTo="/sales/receipts"
      backLabel="Customer receipts"
      embedded={embedded}
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
                primary={canAllocate ? { label: 'Apply deposit to invoice', onClick: () => setAllocating(true) } : undefined}
              />
            }
          />

          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          <StatStrip columns={3}>
            <StatTile variant="compact" icon={BanknoteIcon} label="Amount received" value={formatCurrency(receipt.amount)} />
            <StatTile variant="compact" icon={WalletIcon} label="Applied to invoices" value={formatCurrency(allocated)} tone={allocated > 0 ? 'positive' : 'default'} />
            <StatTile
              variant="compact"
              icon={PiggyBankIcon}
              label="Customer deposit"
              value={formatCurrency(receipt.unallocatedAmount)}
              tone={receipt.unallocatedAmount > EPSILON ? 'info' : 'default'}
            />
          </StatStrip>

          <RecordTabs urlParam="tab" embedded={embedded} ariaLabel="Customer receipt sections" tabs={tabs} />

          {allocating && (
            <AllocationFormModal
              title={`Allocate ${receipt.receiptNumber}`}
              openInvoices={openInvoiceOptions}
              maxAmount={receipt.unallocatedAmount}
              onSubmit={async (invoiceId, amount, allocationId) => {
                setActionError(null);
                try {
                  await allocateToInvoice(receipt.id, invoiceId, amount, allocationId);
                  await refetchInvoices();
                  setAllocating(false);
                } catch (err) {
                  setActionError(toAccountingErrorMessage(err, { reference: receipt.receiptNumber, action: 'allocate this receipt' }));
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
