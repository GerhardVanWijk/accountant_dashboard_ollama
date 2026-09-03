import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { QuoteList } from '@/features/sales/components/QuoteList';
import { QuoteFormModal } from '@/features/sales/components/QuoteFormModal';
import { useQuotes } from '@/features/sales/hooks/useQuotes';
import { useQuoteMutations } from '@/features/sales/hooks/useQuoteMutations';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

type FormState = { mode: 'create' } | null;

/**
 * Route target for /sales/quotes — the list only. A row click navigates to
 * the full-page record at `/sales/quotes/:quoteId` (QuoteDetailPage);
 * legacy `?record=<id>` deep links are redirected there. Lifecycle actions
 * (send / accept / decline / convert / delete) live on the record page.
 */
export function QuotesPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/sales/quotes');

  const [formState, setFormState] = useState<FormState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { quotes, isLoading, error, refetch } = useQuotes();
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { createQuote } = useQuoteMutations({ onSuccess: () => refetch() });

  const nextQuoteNumber = `QUO-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(4, '0')}`;

  async function handleCreate(data: Parameters<typeof createQuote>[0]) {
    await createQuote(data);
    setFormState(null);
    setNotice('Quote created.');
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
              navigate(`/sales/quotes/${id}`);
            }}
          />
        )}
      </div>

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
