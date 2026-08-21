import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { QuoteList } from '@/features/sales/components/QuoteList';
import { QuoteDetail } from '@/features/sales/components/QuoteDetail';
import { QuoteForm } from '@/features/sales/components/QuoteForm';
import { Modal } from '@/features/sales/components/Modal';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useQuoteMutations } from '@/features/sales/hooks/useQuoteMutations';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type View = { type: 'list' } | { type: 'detail'; id: string };

/**
 * Route target for /sales/quotes. Assembles the Quote list/detail views and
 * create form, plus the Quote -> Sales Order conversion action.
 */
export function QuotesPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { quotes, isLoading, error, refetch } = useQuotes();
  // Derived from the (re-fetched) list rather than a separate by-id fetch,
  // so a status-transition mutation is reflected immediately in the open
  // detail view without a stale read — see final report for rationale.
  const detailQuote = view.type === 'detail' ? quotes.find((q) => q.id === view.id) : undefined;
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const {
    createQuote,
    markAsSent,
    markAsAccepted,
    markAsDeclined,
    convertToSalesOrder,
    isLoading: isMutating,
    error: mutationError,
  } = useQuoteMutations({
    onSuccess: () => refetch(),
  });

  const nextQuoteNumber = `QUO-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(4, '0')}`;

  async function handleCreate(data: Parameters<typeof createQuote>[0]) {
    await createQuote(data);
    setShowForm(false);
  }

  async function handleTransition(action: (id: string) => Promise<unknown>, id: string, message: string) {
    await action(id);
    setNotice(message);
  }

  async function handleConvert(id: string) {
    const order = await convertToSalesOrder(id);
    setNotice(`Converted to Sales Order ${order.orderNumber}. Find it on the Sales Orders page.`);
    setView({ type: 'list' });
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quotes</h1>
        {view.type === 'list' && (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Icon name="add" size={16} />
            New Quote
          </Button>
        )}
      </div>

      {notice && (
        <p className="rounded-md border border-positive bg-positive/10 px-sm py-xs text-sm text-positive">{notice}</p>
      )}
      {mutationError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {mutationError.message}
        </p>
      )}

      {view.type === 'list' && (
        <QuoteList
          quotes={quotes}
          customers={customerMap}
          onSelect={(id) => {
            setNotice(null);
            setView({ type: 'detail', id });
          }}
          isLoading={isLoading}
          error={error?.message}
        />
      )}

      {view.type === 'detail' && detailQuote && (
        <QuoteDetail
          quote={detailQuote}
          customerName={customerMap.get(detailQuote.customerId) || 'Unknown Customer'}
          onClose={() => setView({ type: 'list' })}
          isBusy={isMutating}
          onMarkAsSent={(id) => void handleTransition(markAsSent, id, 'Quote marked as sent.')}
          onMarkAsAccepted={(id) => void handleTransition(markAsAccepted, id, 'Quote marked as accepted.')}
          onMarkAsDeclined={(id) => void handleTransition(markAsDeclined, id, 'Quote marked as declined.')}
          onConvertToSalesOrder={(id) => void handleConvert(id)}
        />
      )}

      {showForm && (
        <Modal title="New Quote" onClose={() => setShowForm(false)} wide>
          <QuoteForm
            customers={customerList}
            defaultQuoteNumber={nextQuoteNumber}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  );
}
