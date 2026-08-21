import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { CreditNoteList } from '@/features/sales/components/CreditNoteList';
import { CreditNoteDetail } from '@/features/sales/components/CreditNoteDetail';
import { CreditNoteForm } from '@/features/sales/components/CreditNoteForm';
import { AllocationForm, type OpenInvoiceOption } from '@/features/sales/components/AllocationForm';
import { Modal } from '@/features/sales/components/Modal';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCreditNoteMutations } from '@/features/sales/hooks/useCreditNoteMutations';
import { useInvoices } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCompany } from '@/features/admin/hooks/useCompany';

type View = { type: 'list' } | { type: 'detail'; id: string };

/** Outstanding-balance epsilon, matching CreditNoteService.BALANCE_EPSILON. */
const EPSILON = 0.01;

/**
 * Route target for /sales/credit-notes. Assembles the Credit Note
 * list/detail views, the create form, and the "Allocate to Invoice" flow.
 */
export function CreditNotesPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [showForm, setShowForm] = useState(false);
  const [showAllocate, setShowAllocate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { creditNotes, isLoading, error, refetch } = useCreditNotes();
  const detailCreditNote = view.type === 'detail' ? creditNotes.find((cn) => cn.id === view.id) : undefined;
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
  } = useCreditNoteMutations({
    onSuccess: () => refetch(),
  });

  const nextCreditNoteNumber = `CN-${new Date().getFullYear()}-${String(creditNotes.length + 1).padStart(4, '0')}`;

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
    <div className="flex flex-col gap-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Credit Notes</h1>
        {view.type === 'list' && (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Icon name="add" size={16} />
            New Credit Note
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
        <CreditNoteList
          creditNotes={creditNotes}
          customers={customerMap}
          onSelect={(id) => {
            setNotice(null);
            setView({ type: 'detail', id });
          }}
          isLoading={isLoading}
          error={error?.message}
        />
      )}

      {view.type === 'detail' && detailCreditNote && (
        <CreditNoteDetail
          creditNote={detailCreditNote}
          customerName={customerMap.get(detailCreditNote.customerId) || 'Unknown Customer'}
          linkedInvoiceNumber={linkedInvoiceNumber}
          company={company}
          onClose={() => setView({ type: 'list' })}
          isBusy={isMutating}
          onIssue={(id) => void handleIssue(id)}
          onVoid={(id) => void handleVoid(id)}
          onAllocate={() => setShowAllocate(true)}
        />
      )}

      {showForm && (
        <Modal title="New Credit Note" onClose={() => setShowForm(false)} wide>
          <CreditNoteForm
            customers={customerList}
            invoices={invoices}
            defaultCreditNoteNumber={nextCreditNoteNumber}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}

      {showAllocate && detailCreditNote && (
        <Modal title={`Allocate ${detailCreditNote.creditNoteNumber}`} onClose={() => setShowAllocate(false)}>
          <AllocationForm
            openInvoices={openInvoiceOptions}
            maxAmount={detailCreditNote.total - detailCreditNote.amountAllocated}
            onSubmit={handleAllocate}
            onCancel={() => setShowAllocate(false)}
          />
        </Modal>
      )}
    </div>
  );
}
