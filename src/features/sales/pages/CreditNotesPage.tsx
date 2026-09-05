import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { CreditNoteList } from '@/features/sales/components/CreditNoteList';
import { CreditNoteFormModal } from '@/features/sales/components/CreditNoteFormModal';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCreditNoteMutations } from '@/features/sales/hooks/useCreditNoteMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';

/**
 * Route target for /sales/credit-notes — the list only. A row click
 * navigates to the full-page record at `/sales/credit-notes/:creditNoteId`
 * (CreditNoteDetailPage); legacy `?record=<id>` deep links are redirected
 * there. Issue / void / allocate all live on the record page.
 */
export function CreditNotesPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/sales/credit-notes');

  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { creditNotes, isLoading, error, refetch } = useCreditNotes();
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { invoices } = useInvoices();
  const { createCreditNote, error: mutationError } = useCreditNoteMutations({ onSuccess: () => refetch() });

  const nextCreditNoteNumber = `CN-${new Date().getFullYear()}-${String(creditNotes.length + 1).padStart(4, '0')}`;

  const applied = creditNotes.filter((cn) => cn.status === 'allocated');
  const drafts = creditNotes.filter((cn) => cn.status === 'draft');
  const credited = applied.reduce((sum, cn) => sum + cn.total, 0);
  const vatReversed = applied.reduce((sum, cn) => sum + cn.taxTotal, 0);

  async function handleCreate(data: Parameters<typeof createCreditNote>[0]) {
    await createCreditNote(data);
    setShowForm(false);
    setNotice('Credit note created.');
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Credit notes"
          description="Credits raised against issued invoices. Applied notes reduce the customer balance and reverse the output VAT."
          actions={
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus data-icon="inline-start" />
              New credit note
            </Button>
          }
        />

        <SectionCard>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FigureBlock label="Credited" value={formatCurrency(credited)} hint={`${applied.length} allocated notes`} />
            <FigureBlock label="Output VAT reversed" value={formatCurrency(vatReversed)} hint="Recovered on the VAT201 return" tone="positive" />
            <FigureBlock label="In draft" value={String(drafts.length)} hint="Not yet issued" tone={drafts.length > 0 ? 'warning' : 'default'} />
            <FigureBlock label="Average credit" value={formatCurrency(applied.length > 0 ? credited / applied.length : 0)} hint="Per allocated note" />
          </div>
        </SectionCard>

        {notice && (
          <p className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">{notice}</p>
        )}
        {mutationError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {mutationError.message}
          </p>
        )}

        {isLoading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading credit notes…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : (
          <CreditNoteList
            creditNotes={creditNotes}
            customers={customerMap}
            onSelect={(id) => {
              setNotice(null);
              navigate(`/sales/credit-notes/${id}`);
            }}
          />
        )}
      </div>

      {showForm && (
        <CreditNoteFormModal
          customers={customerList}
          invoices={invoices}
          creditNotes={creditNotes}
          defaultCreditNoteNumber={nextCreditNoteNumber}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
