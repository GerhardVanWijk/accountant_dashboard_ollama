import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { CreditNoteList } from '@/features/sales/components/CreditNoteList';
import { CreditNoteDetailSheet } from '@/features/sales/components/CreditNoteDetailSheet';
import { CreditNoteFormModal } from '@/features/sales/components/CreditNoteFormModal';
import { AllocationFormModal, type OpenInvoiceOption } from '@/features/sales/components/AllocationFormModal';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCreditNoteMutations } from '@/features/sales/hooks/useCreditNoteMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCompany } from '@/features/admin/hooks/useCompany';

/** Outstanding-balance epsilon, matching CreditNoteService.BALANCE_EPSILON. */
const EPSILON = 0.01;

/**
 * Route target for /sales/credit-notes — real useCreditNotes()/
 * CreditNoteService data, v0 page shell, list/detail views and the create
 * form + "Allocate to Invoice" flow in-page-state.
 */
export function CreditNotesPage() {
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

  const [showForm, setShowForm] = useState(false);
  const [showAllocate, setShowAllocate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { creditNotes, isLoading, error, refetch } = useCreditNotes();
  const detailCreditNote = creditNotes.find((cn) => cn.id === selectedId);
  const { customers: customerMap } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { invoices, refetch: refetchInvoices } = useInvoices();
  const { company } = useCompany();
  const {
    createCreditNote,
    issueCreditNote,
    allocateToInvoice,
    voidCreditNote,
    isLoading: isMutating,
    error: mutationError,
  } = useCreditNoteMutations({ onSuccess: () => refetch() });

  const nextCreditNoteNumber = `CN-${new Date().getFullYear()}-${String(creditNotes.length + 1).padStart(4, '0')}`;

  const applied = creditNotes.filter((cn) => cn.status === 'allocated');
  const drafts = creditNotes.filter((cn) => cn.status === 'draft');
  const credited = applied.reduce((sum, cn) => sum + cn.total, 0);
  const vatReversed = applied.reduce((sum, cn) => sum + cn.taxTotal, 0);

  const linkedInvoiceNumber = detailCreditNote?.invoiceId
    ? invoices.find((inv) => inv.id === detailCreditNote.invoiceId)?.invoiceNumber
    : undefined;

  const openInvoiceOptions: OpenInvoiceOption[] = detailCreditNote
    ? invoices
        .filter((inv) => inv.customerId === detailCreditNote.customerId && inv.total - inv.amountPaid > EPSILON)
        .map((inv) => ({ invoice: inv, outstanding: inv.total - inv.amountPaid }))
    : [];

  async function handleCreate(data: Parameters<typeof createCreditNote>[0]) {
    await createCreditNote(data);
    setShowForm(false);
  }

  async function handleIssue(id: string) {
    await issueCreditNote(id);
    setNotice('Credit note issued and posted to the ledger.');
  }

  async function handleVoid(id: string) {
    await voidCreditNote(id);
    setNotice('Credit note voided.');
  }

  async function handleAllocate(invoiceId: string, amount: number) {
    if (!detailCreditNote) return;
    await allocateToInvoice(detailCreditNote.id, invoiceId, amount);
    await refetchInvoices();
    setShowAllocate(false);
    setNotice('Credit note allocated to invoice.');
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
            <FigureBlock
              label="Output VAT reversed"
              value={formatCurrency(vatReversed)}
              hint="Recovered on the VAT201 return"
              tone="positive"
            />
            <FigureBlock
              label="In draft"
              value={String(drafts.length)}
              hint="Not yet issued"
              tone={drafts.length > 0 ? 'warning' : 'default'}
            />
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
              openRecord(id);
            }}
          />
        )}
      </div>

      <CreditNoteDetailSheet
        creditNote={detailCreditNote}
        isLoading={isLoading}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeRecord();
        }}
        customerName={detailCreditNote ? customerMap.get(detailCreditNote.customerId) || 'Unknown Customer' : ''}
        linkedInvoiceNumber={linkedInvoiceNumber}
        company={company}
        isBusy={isMutating}
        onIssue={(id) => void handleIssue(id)}
        onVoid={(id) => void handleVoid(id)}
        onAllocate={() => setShowAllocate(true)}
      />

      {showForm && (
        <CreditNoteFormModal
          customers={customerList}
          invoices={invoices}
          defaultCreditNoteNumber={nextCreditNoteNumber}
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {showAllocate && detailCreditNote && (
        <AllocationFormModal
          title={`Allocate ${detailCreditNote.creditNoteNumber}`}
          openInvoices={openInvoiceOptions}
          maxAmount={detailCreditNote.total - detailCreditNote.amountAllocated}
          onSubmit={handleAllocate}
          onClose={() => setShowAllocate(false)}
        />
      )}
    </>
  );
}
