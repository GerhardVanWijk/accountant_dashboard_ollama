import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BanknoteIcon, WalletIcon } from 'lucide-react';
import {
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
import { formatCurrency, formatDate } from '@/lib/app/format';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePayments, useBills } from '@/features/purchases/hooks';

const METHOD_LABELS: Record<string, string> = {
  eft: 'EFT', cash: 'Cash', card: 'Card', cheque: 'Cheque', other: 'Other',
};

/**
 * Full-page Supplier Payment detail — route
 * `/purchases/payments/:paymentId`. A tabbed workspace: Overview,
 * Allocations (which supplier invoices the money went to), Accounting (bank
 * / AP / journal), Related records, Activity. Recording a payment posts
 * immediately, so there are no lifecycle actions here.
 */
export function SupplierPaymentDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ paymentId: string }>();
  const paymentId = recordId ?? params.paymentId;

  const { payments, isLoading, error } = usePayments();
  const payment = payments.find((p) => p.id === paymentId);
  const { bills } = useBills();
  const { suppliers } = useSuppliers();

  const suppliersMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const billById = useMemo(() => new Map(bills.map((b) => [b.id, b])), [bills]);
  const supplierName = payment ? suppliersMap.get(payment.supplierId) ?? 'Unknown supplier' : '';
  const allocated = payment ? payment.amount - payment.unallocatedAmount : 0;

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!payment) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Supplier', value: <Link className="font-medium text-brand hover:underline" to="/purchases/vendors">{supplierName}</Link> },
    ];
    for (const a of payment.allocations) {
      const b = billById.get(a.billId);
      if (!b) continue;
      items.push({
        label: 'Applied to supplier invoice',
        value: (
          <Link className="font-medium text-brand hover:underline" to={`/purchases/bills/${b.id}`}>
            {b.billNumber} ({formatCurrency(a.amount)})
          </Link>
        ),
      });
    }
    if (payment.journalEntryId) {
      items.push({
        label: 'GL posting',
        value: <Link className="font-medium text-brand hover:underline" to={`/accounting/journals?record=${payment.journalEntryId}`}>View journal entry</Link>,
      });
    }
    if (payment.bankAccountId) {
      items.push({ label: 'Bank account', value: <Link className="font-medium text-brand hover:underline" to="/banking/accounts">View bank account</Link> });
    }
    return items;
  }, [payment, supplierName, billById]);

  const state = isLoading ? 'loading' : error ? 'error' : payment ? 'ready' : 'not-found';

  const tabs: RecordTab[] = payment
    ? [
        {
          value: 'overview',
          label: 'Overview',
          content: (
            <>
              <RecordPageSection title="Payment details">
                <RecordSummaryGrid>
                  <RecordField label="Date paid" value={formatDate(payment.date)} />
                  <RecordField label="Method" value={METHOD_LABELS[payment.method] ?? payment.method} />
                  {payment.reference && <RecordField label="Reference" value={payment.reference} />}
                </RecordSummaryGrid>
              </RecordPageSection>
              {payment.notes && (
                <RecordPageSection title="Notes">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{payment.notes}</p>
                </RecordPageSection>
              )}
            </>
          ),
        },
        {
          value: 'allocations',
          label: 'Allocations',
          count: payment.allocations.length,
          content: (
            <RecordPageSection title="Allocations">
              {payment.allocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has been allocated — this payment is entirely on account.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
                        <th className="px-4 py-2">Supplier invoice</th>
                        <th className="px-4 py-2 text-right">Invoice total</th>
                        <th className="px-4 py-2 text-right">Allocated</th>
                        <th className="px-4 py-2 text-right">Still outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payment.allocations.map((a, i) => {
                        const b = billById.get(a.billId);
                        return (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-4 py-2">
                              {b ? <Link className="text-brand hover:underline" to={`/purchases/bills/${b.id}`}>{b.billNumber}</Link> : a.billId}
                            </td>
                            <td className="figure px-4 py-2 text-right tabular-nums">{b ? formatCurrency(b.total) : '—'}</td>
                            <td className="figure px-4 py-2 text-right tabular-nums">{formatCurrency(a.amount)}</td>
                            <td className="figure px-4 py-2 text-right tabular-nums">{b ? formatCurrency(b.total - b.amountPaid) : '—'}</td>
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
                <RecordField label="Amount paid" value={formatCurrency(payment.amount)} />
                <RecordField label="Bank / cash" value={payment.bankAccountId ? 'Paid from a bank account' : 'Cash / other'} />
                <RecordField label="Accounts payable" value={`Reduced by ${formatCurrency(allocated)}`} />
                <RecordField
                  label="Journal entry"
                  value={
                    payment.journalEntryId ? (
                      <Link className="text-brand hover:underline" to={`/accounting/journals?record=${payment.journalEntryId}`}>View journal entry</Link>
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
          content: <RelatedRecordsSection items={relatedItems} />,
        },
        {
          value: 'activity',
          label: 'Activity',
          content: (
            <RecordActivitySection recordType="Payment" recordId={payment.id} title="Record activity" subtitle="Changes and lifecycle events for this payment." />
          ),
        },
      ]
    : [];

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Purchases' }, { label: 'Supplier payments', to: '/purchases/payments' }, { label: payment?.paymentNumber ?? 'Supplier payment' }]}
      backTo="/purchases/payments"
      backLabel="Supplier payments"
      embedded={embedded}
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This payment could not be found — it may have been deleted."
    >
      {payment && (
        <>
          <RecordPageHeader
            recordNumber={payment.paymentNumber}
            title={supplierName}
            meta={`Paid ${formatDate(payment.date)} · ${METHOD_LABELS[payment.method] ?? payment.method}`}
          />

          <StatStrip columns={3}>
            <StatTile size="compact" icon={BanknoteIcon} label="Amount paid" value={formatCurrency(payment.amount)} />
            <StatTile size="compact" icon={WalletIcon} label="Allocated" value={formatCurrency(allocated)} tone={allocated > 0 ? 'positive' : 'default'} />
            <StatTile
              size="compact"
              icon={WalletIcon}
              label="On account"
              value={formatCurrency(payment.unallocatedAmount)}
              tone={payment.unallocatedAmount > 0.01 ? 'warning' : 'default'}
            />
          </StatStrip>

          <RecordTabs urlParam="tab" embedded={embedded} ariaLabel="Supplier payment sections" tabs={tabs} />
        </>
      )}
    </RecordPageShell>
  );
}
