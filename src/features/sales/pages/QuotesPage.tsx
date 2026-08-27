import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { QuoteList } from '@/features/sales/components/QuoteList';
import { QuoteDetail } from '@/features/sales/components/QuoteDetail';
import { QuoteFormModal } from '@/features/sales/components/QuoteFormModal';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useQuoteMutations } from '@/features/sales/hooks/useQuoteMutations';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type View = { type: 'list' } | { type: 'detail'; id: string };
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
  const [view, setView] = useState<View>({ type: 'list' });
  const [formState, setFormState] = useState<FormState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { quotes, isLoading, error, refetch } = useQuotes();
  // Derived from the (re-fetched) list rather than a separate by-id fetch,
  // so a status-transition mutation is reflected immediately in the open
  // detail view without a stale read.
  const detailQuote = view.type === 'detail' ? quotes.find((q) => q.id === view.id) : undefined;
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
      setView({ type: 'list' });
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
      setView({ type: 'list' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not convert quote to a sales order.');
    }
  }

  return (
    <>
      {view.type === 'list' && (
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

          <QuoteList
            quotes={quotes}
            customers={customerMap}
            onSelect={(id) => {
              setNotice(null);
              setActionError(null);
              setView({ type: 'detail', id });
            }}
          />
        </div>
      )}

      {isLoading && view.type === 'list' && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading quotes…</p>
        </div>
      )}

      {!isLoading && error && view.type === 'list' && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {view.type === 'detail' && detailQuote && (
        <div className="flex flex-col gap-6">
          {actionError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}
          <QuoteDetail
            quote={detailQuote}
            customerName={customerMap.get(detailQuote.customerId) || 'Unknown Customer'}
            onBack={() => setView({ type: 'list' })}
            onDelete={() => void handleDelete(detailQuote.id)}
            isBusy={isMutating}
            onMarkAsSent={(id) => void handleTransition(markAsSent, id, 'Quote marked as sent.')}
            onMarkAsAccepted={(id) => void handleTransition(markAsAccepted, id, 'Quote marked as accepted.')}
            onMarkAsDeclined={(id) => void handleTransition(markAsDeclined, id, 'Quote marked as declined.')}
            onConvertToSalesOrder={(id) => void handleConvert(id)}
          />
        </div>
      )}

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
