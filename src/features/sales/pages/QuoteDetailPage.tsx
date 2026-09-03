import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Quote } from '@/types';
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
import { getTaxRateLabel } from '@/features/inventory/constants';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useQuoteMutations } from '@/features/sales/hooks/useQuoteMutations';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap } from '@/features/sales/hooks/useCustomerMap';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useAllTaxRates } from '@/features/tax/hooks/useTaxRates';

/**
 * Full-page Quote detail — route `/sales/quotes/:quoteId`. Replaces the
 * right-hand sheet: line items get the page width, and the pre-sale chain
 * (quote → sales order) is a clickable related record. Quotes never post to
 * the GL, so there is no accounting section. Same
 * quoteService.markAsSent()/markAsAccepted()/markAsDeclined()/
 * convertToSalesOrder()/deleteQuote() calls as before.
 */
export function QuoteDetailPage({ recordId, embedded }: RecordPageProps = {}) {
  const params = useParams<{ quoteId: string }>();
  const quoteId = recordId ?? params.quoteId;
  const navigate = useNavigate();

  const { quotes, isLoading, error, refetch } = useQuotes();
  const quote = quotes.find((q) => q.id === quoteId);
  const { customers: customerMap } = useCustomerMap();
  const { salesOrders } = useSalesOrders();
  const { products } = useProducts();
  const { taxRates, loading: taxRatesLoading, error: taxRatesError } = useAllTaxRates();

  const {
    deleteQuote, markAsSent, markAsAccepted, markAsDeclined, convertToSalesOrder, isLoading: isBusy,
  } = useQuoteMutations({ onSuccess: () => refetch() });

  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const customerName = quote ? customerMap.get(quote.customerId) || 'Unknown customer' : '';
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const convertedOrder = quote ? salesOrders.find((o) => o.quoteId === quote.id) : undefined;

  const lineColumns = useMemo(
    () =>
      documentLineColumns<Quote['lineItems'][number]>({
        resolveProduct: (id) => {
          const p = id ? productMap.get(id) : undefined;
          return p ? { sku: p.sku, name: p.name } : undefined;
        },
        resolveTaxLabel: (id) => getTaxRateLabel(id, taxRates, { pending: taxRatesLoading || Boolean(taxRatesError) }),
      }),
    [productMap, taxRates, taxRatesLoading, taxRatesError],
  );

  const relatedItems = useMemo<RelatedRecordItem[]>(() => {
    if (!quote) return [];
    const items: RelatedRecordItem[] = [
      { label: 'Customer', value: <Link className="font-medium text-brand hover:underline" to="/sales/customers">{customerName}</Link> },
    ];
    if (convertedOrder) {
      items.push({
        label: 'Sales order',
        value: <Link className="font-medium text-brand hover:underline" to={`/sales/orders/${convertedOrder.id}`}>{convertedOrder.orderNumber}</Link>,
      });
    }
    return items;
  }, [quote, customerName, convertedOrder]);

  async function act(fn: () => Promise<unknown>, after: () => void = () => {}) {
    setActionError(null);
    try {
      await fn();
      after();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update this quote.');
    }
  }

  const state = isLoading ? 'loading' : error ? 'error' : quote ? 'ready' : 'not-found';

  const primary =
    quote?.status === 'accepted'
      ? {
          label: 'Convert to sales order',
          onClick: () =>
            void act(
              () => convertToSalesOrder(quote.id).then((o) => { if (o?.id) navigate(`/sales/orders/${o.id}`); }),
            ),
        }
      : quote?.status === 'sent'
        ? { label: 'Mark as accepted', onClick: () => void act(() => markAsAccepted(quote.id)) }
        : quote?.status === 'draft'
          ? { label: 'Mark as sent', onClick: () => void act(() => markAsSent(quote.id)) }
          : undefined;

  return (
    <RecordPageShell
      breadcrumbs={[{ label: 'Sales' }, { label: 'Quotes', to: '/sales/quotes' }, { label: quote?.quoteNumber ?? 'Quote' }]}
      backTo="/sales/quotes"
      backLabel="Quotes"
      embedded={embedded}
      state={state}
      errorMessage={error?.message}
      notFoundMessage="This quote could not be found — it may have been deleted."
    >
      {quote && (
        <>
          <RecordPageHeader
            recordNumber={quote.quoteNumber}
            title={customerName}
            meta={`Issued ${formatDate(quote.issueDate)} · expires ${formatDate(quote.expiryDate)}`}
            status={<StatusBadge status={quote.status} />}
            actions={
              <RecordActionBar
                busy={isBusy}
                primary={primary}
                danger={[
                  ...(quote.status === 'sent' ? [{ label: 'Mark as declined', onClick: () => void act(() => markAsDeclined(quote.id)) }] : []),
                  ...(quote.status === 'draft' ? [{ label: 'Delete draft', onClick: () => setConfirmDelete(true) }] : []),
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
              <RecordField label="Issue date" value={formatDate(quote.issueDate)} />
              <RecordField label="Expiry date" value={formatDate(quote.expiryDate)} />
              <RecordField label="Status" value={<StatusBadge status={quote.status} />} />
              <RecordField label="Currency" value={quote.currency} />
              {convertedOrder && <RecordField label="Converted to" value={convertedOrder.orderNumber} />}
            </RecordSummaryGrid>
          </RecordPageSection>

          <RecordPageSection title="Line items">
            <DocumentLineTable
              columns={lineColumns}
              rows={quote.lineItems}
              rowKey={(l) => l.id}
              minWidthClassName="min-w-[860px]"
              totals={[
                { label: 'Subtotal', value: formatCurrency(quote.subtotal) },
                { label: 'VAT', value: formatCurrency(quote.taxTotal) },
                { label: 'Total', value: formatCurrency(quote.total), emphasis: true },
              ]}
            />
          </RecordPageSection>

          {quote.notes && (
            <RecordPageSection title="Notes">
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
            </RecordPageSection>
          )}

          <RelatedRecordsSection items={relatedItems} />

          <RecordActivitySection recordType="Quote" recordId={quote.id} title="Record activity" subtitle="Changes and lifecycle events for this quote." />

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete ${quote.quoteNumber}?`}
            description="This permanently removes the draft quote. Once sent, a quote is customer-facing and must be declined or left to expire instead."
            confirmLabel="Delete draft"
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              void act(() => deleteQuote(quote.id), () => navigate('/sales/quotes'));
            }}
          />
        </>
      )}
    </RecordPageShell>
  );
}
