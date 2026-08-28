import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { Invoice } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { InvoiceList } from '@/features/sales/components/InvoiceList';
import { InvoiceDetailSheet } from '@/features/sales/components/InvoiceDetailSheet';
import { InvoiceFormModal } from '@/features/sales/components/InvoiceFormModal';
import { CustomerReceiptFormModal } from '@/features/sales/components/CustomerReceiptFormModal';
import { useInvoices, useInvoiceMutations } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCustomerReceipts } from '@/features/sales/hooks/useCustomerReceipts';
import { useCustomerReceiptMutations } from '@/features/sales/hooks/useCustomerReceiptMutations';
import { useCreditNotes } from '@/features/sales/hooks/useCreditNotes';
import { useCompany } from '@/features/admin/hooks/useCompany';
import { invoiceService } from '@/services';
import type { CreateInvoiceDTO } from '@/services/invoiceService';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

type FormState = { mode: 'create' } | { mode: 'edit'; invoice: Invoice } | null;

/**
 * Route target for /sales/invoices — real useInvoices()/InvoiceService
 * data throughout, v0 page shell (PageHeader/SectionCard/FigureBlock),
 * list/detail views and create/edit modal in-page-state, matching every
 * other module's convention (no dedicated /sales/invoices/:id route).
 */
export function InvoicesPage() {
  // Deep-linkable via ?record=<id> (audit rule "URL / deep link
  // consideration") — a record opens as an overlay ON TOP of the list,
  // which stays mounted throughout: closing it (or clearing the param)
  // returns exactly to the same filters/search/sort/scroll position,
  // never a full page swap. useSearchParams is already the router's own
  // primitive elsewhere in this app, so this doesn't fight the existing
  // architecture.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedInvoiceId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedInvoiceId);

  function openInvoice(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeInvoice() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }

  const [formState, setFormState] = useState<FormState>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const { invoices, loading, error, refetch: refetchList } = useInvoices();
  const { customers } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { createInvoice, updateInvoice, deleteInvoice, markInvoiceAsSent, saving, error: saveError } = useInvoiceMutations();
  const { company } = useCompany();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const canCreate = useCanAccess('invoicing', 'create');
  const canUpdate = useCanAccess('invoicing', 'update');
  const canDelete = useCanAccess('invoicing', 'delete');

  const { receipts, refetch: refetchReceipts } = useCustomerReceipts();
  const { recordReceipt } = useCustomerReceiptMutations();
  const { creditNotes } = useCreditNotes();
  const nextReceiptNumber = `RCT-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(4, '0')}`;
  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId);

  const outstandingInvoices = invoices.filter((inv) => inv.status !== 'void' && inv.total - inv.amountPaid > 0);
  const outstandingTotal = outstandingInvoices.reduce((sum, inv) => sum + (inv.total - inv.amountPaid), 0);
  const overdueInvoices = invoices.filter((inv) => invoiceService.isOverdue(inv));
  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + (inv.total - inv.amountPaid), 0);
  const paidTotal = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.amountPaid, 0);
  const drafts = invoices.filter((inv) => inv.status === 'draft');

  /**
   * Deliberately does NOT catch — CustomerReceiptFormModal's own onSubmit
   * handler already wraps this in try/catch and shows the error inline in
   * the modal.
   */
  async function handleRecordPayment(data: Parameters<typeof recordReceipt>[0]): Promise<void> {
    await recordReceipt(data);
    await refetchReceipts();
    setShowRecordPayment(false);
    refetchList();
    setDataVersion((t) => t + 1);
  }

  async function handleMarkAsSent(invoiceId: string): Promise<void> {
    setActionError(null);
    try {
      await markInvoiceAsSent(invoiceId);
      refetchList();
      setDataVersion((t) => t + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not post invoice.');
    }
  }

  async function handleDelete(invoiceId: string): Promise<void> {
    setActionError(null);
    try {
      await deleteInvoice(invoiceId);
      closeInvoice();
      refetchList();
      setDataVersion((t) => t + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete invoice.');
    }
  }

  async function handleFormSubmit(values: Partial<Invoice>): Promise<void> {
    if (formState?.mode === 'edit') {
      await updateInvoice(formState.invoice.id, values);
    } else {
      const createData: CreateInvoiceDTO = {
        invoiceNumber: values.invoiceNumber || '',
        customerId: values.customerId || '',
        issueDate: values.issueDate || new Date().toISOString(),
        dueDate: values.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: values.lineItems || [],
        subtotal: values.subtotal || 0,
        taxTotal: values.taxTotal || 0,
        total: values.total || 0,
        amountPaid: values.amountPaid || 0,
        currency: values.currency || 'ZAR',
        status: values.status || 'draft',
        notes: values.notes,
      };
      await createInvoice(createData);
    }
    setFormState(null);
    refetchList();
    setDataVersion((t) => t + 1);
  }

  return (
    <>
      <div className="flex flex-col gap-6" key={dataVersion}>
        <PageHeader
          title="Invoices"
          description="Every invoice raised against your customers, with outstanding balances and payment status."
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setFormState({ mode: 'create' })}>
                <Plus data-icon="inline-start" />
                New invoice
              </Button>
            ) : undefined
          }
        />

        <SectionCard>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FigureBlock
              label="Outstanding"
              value={formatCurrency(outstandingTotal)}
              hint={`${outstandingInvoices.length} invoices awaiting payment`}
            />
            <FigureBlock
              label="Overdue"
              value={formatCurrency(overdueTotal)}
              hint={`${overdueInvoices.length} past their due date`}
              tone="negative"
            />
            <FigureBlock label="Collected" value={formatCurrency(paidTotal)} hint="Fully settled invoices" tone="positive" />
            <FigureBlock
              label="In draft"
              value={String(drafts.length)}
              hint="Not yet sent to customers"
              tone={drafts.length > 0 ? 'warning' : 'default'}
            />
          </div>
        </SectionCard>

        {loading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading invoices…</p>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <InvoiceList invoices={invoices} customers={customers} onSelect={openInvoice} />
        )}
      </div>

      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <InvoiceDetailSheet
        invoiceId={selectedInvoiceId}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeInvoice();
        }}
        customerName={selectedInvoice ? customers.get(selectedInvoice.customerId) || 'Unknown Customer' : ''}
        company={company}
        creditNotes={creditNotes}
        receipts={receipts}
        onEdit={selectedInvoice && canUpdate ? () => setFormState({ mode: 'edit', invoice: selectedInvoice }) : undefined}
        onDelete={selectedInvoice && canDelete ? () => void handleDelete(selectedInvoice.id) : undefined}
        onMarkAsSent={selectedInvoice && canUpdate ? () => void handleMarkAsSent(selectedInvoice.id) : undefined}
        onRecordPayment={() => setShowRecordPayment(true)}
      />

      {showRecordPayment && selectedInvoice && (
        <CustomerReceiptFormModal
          title={`Record payment — ${selectedInvoice.invoiceNumber}`}
          customers={customerList}
          invoices={invoices}
          defaultReceiptNumber={nextReceiptNumber}
          presetInvoiceId={selectedInvoice.id}
          onSubmit={handleRecordPayment}
          onClose={() => setShowRecordPayment(false)}
        />
      )}

      {formState && (
        <InvoiceFormModal
          title={formState.mode === 'create' ? 'New invoice' : `Edit ${formState.invoice.invoiceNumber}`}
          invoice={formState.mode === 'edit' ? formState.invoice : undefined}
          customers={new Map(customerList.map((c) => [c.id, c.name]))}
          onSubmit={handleFormSubmit}
          onClose={() => setFormState(null)}
          isLoading={saving}
        />
      )}
      {formState && saveError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError.message}
        </div>
      )}
    </>
  );
}
