import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { QuoteList } from '@/features/sales/components/QuoteList';
import { QuoteDetailSheet } from '@/features/sales/components/QuoteDetailSheet';
import { QuoteFormModal } from '@/features/sales/components/QuoteFormModal';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useQuoteMutations } from '@/features/sales/hooks/useQuoteMutations';
import { useSalesOrders } from '@/features/sales/hooks/useSalesOrders';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type FormState = { mode: 'create' } | null;

/**
 * Route target for /sales/quotes — real useQuotes()/QuoteService data
 * throughout, v0 page shell (PageHeader), list/detail views and create
 * modal in-page-state, matching InvoicesPage.tsx's convention (M13) — the
 * DataTable-based QuoteList renders bare, same as every sibling module's
 * list (it already draws its own card border; wrapping it in a second
 * SectionCard double-bordered it, fixed in the Phase 4 audit).
 * No `quotes` (or `sales`) entry exists in the real permission catalog
 * (M11) — docs/PERMISSIONS.md already documented Quotes/Orders as ungated
 * alongside Credit Notes/Receipts, so this route/its actions stay ungated,
 * same as before the port.
 */
export function QuotesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedId);
  function openRecord(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeRecord() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }

  const [formState, setFormState] = useState<FormState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { quotes, isLoading, error, refetch } = useQuotes();
  // Derived from the (re-fetched) list rather than a separate by-id fetch,
  // so a status-transition mutation is reflected immediately in the open
  // detail view without a stale read.
  const detailQuote = quotes.find((q) => q.id === selectedId);
  const { salesOrders } = useSalesOrders();
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const {
    createQuote,
    deleteQuote,
    markAsSent,
    markAsAccepted,
    markAsDeclined,
    convertToSalesOrder,
    isLoading: isMutating,
  } = useQuoteMutations({
    onSuccess: () => refetch(),
  });

  const nextQuoteNumber = `QUO-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(4, '0')}`;

  async function handleCreate(data: Parameters<typeof createQuote>[0]) {
    await createQuote(data);
    setFormState(null);
  }

  async function handleTransition(action: (id: string) => Promise<unknown>, id: string, message: string) {
    setActionError(null);
    try {
      await action(id);
      setNotice(message);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update quote.');
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await deleteQuote(id);
      closeRecord();
      setNotice('Draft quote deleted.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete quote.');
    }
  }

  async function handleConvert(id: string) {
    setActionError(null);
    try {
      const order = await convertToSalesOrder(id);
      setNotice(`Converted to Sales Order ${order.orderNumber}. Find it on the Sales Orders page.`);
      closeRecord();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not convert quote to a sales order.');
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Quotes"
          description="Pre-sale quotes issued to customers — nothing here posts to the GL until converted to a sales order and invoiced."
          actions={
            <Button size="sm" onClick={() => setFormState({ mode: 'create' })}>
              <Plus data-icon="inline-start" />
              New quote
            </Button>
          }
        />

        {notice && (
          <p role="status" className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">
            {notice}
          </p>
        )}

        {isLoading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading quotes…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <QuoteList
            quotes={quotes}
            customers={customerMap}
            onSelect={(id) => {
              setNotice(null);
              setActionError(null);
              openRecord(id);
            }}
          />
        )}
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <QuoteDetailSheet
        quote={detailQuote}
        isLoading={isLoading}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        customerName={detailQuote ? customerMap.get(detailQuote.customerId) || 'Unknown Customer' : ''}
        salesOrders={salesOrders}
        onDelete={detailQuote ? () => void handleDelete(detailQuote.id) : undefined}
        isBusy={isMutating}
        onMarkAsSent={(id) => void handleTransition(markAsSent, id, 'Quote marked as sent.')}
        onMarkAsAccepted={(id) => void handleTransition(markAsAccepted, id, 'Quote marked as accepted.')}
        onMarkAsDeclined={(id) => void handleTransition(markAsDeclined, id, 'Quote marked as declined.')}
        onConvertToSalesOrder={(id) => void handleConvert(id)}
      />

      {formState?.mode === 'create' && (
        <QuoteFormModal
          title="New quote"
          customers={customerList}
          defaultQuoteNumber={nextQuoteNumber}
          onSubmit={handleCreate}
          onClose={() => setFormState(null)}
        />
      )}
    </>
  );
}
