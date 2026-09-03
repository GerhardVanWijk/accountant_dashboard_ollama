import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import type { Invoice } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useLegacyRecordRedirect } from '@/components/app/record-page';
import { formatCurrency } from '@/lib/app/format';
import { InvoiceList } from '@/features/sales/components/InvoiceList';
import { InvoiceFormModal } from '@/features/sales/components/InvoiceFormModal';
import { useInvoices, useInvoiceMutations } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { invoiceService } from '@/services';
import type { CreateInvoiceDTO } from '@/services/invoiceService';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';

/**
 * Route target for /sales/invoices — the list only. A row click navigates
 * to the full-page record at `/sales/invoices/:invoiceId`
 * (InvoiceDetailPage); legacy `/sales/invoices?record=<id>` deep links are
 * redirected there. Editing, posting, payment and credit-note actions all
 * live on the record page now.
 */
export function InvoicesPage() {
  const navigate = useNavigate();
  useLegacyRecordRedirect('/sales/invoices');

  const [creating, setCreating] = useState(false);

  const { invoices, loading, error, refetch } = useInvoices();
  const { customers } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { createInvoice, saving, error: saveError } = useInvoiceMutations();
  const canCreate = useCanAccess('invoicing', 'create');

  const outstandingInvoices = invoices.filter((inv) => inv.status !== 'void' && inv.total - inv.amountPaid > 0);
  const outstandingTotal = outstandingInvoices.reduce((sum, inv) => sum + (inv.total - inv.amountPaid), 0);
  const overdueInvoices = invoices.filter((inv) => invoiceService.isOverdue(inv));
  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + (inv.total - inv.amountPaid), 0);
  const paidTotal = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.amountPaid, 0);
  const drafts = invoices.filter((inv) => inv.status === 'draft');

  async function handleCreate(values: Partial<Invoice>): Promise<void> {
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
    setCreating(false);
    refetch();
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Invoices"
          description="Every invoice raised against your customers, with outstanding balances and payment status."
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus data-icon="inline-start" />
                New invoice
              </Button>
            ) : undefined
          }
        />

        <SectionCard>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FigureBlock label="Outstanding" value={formatCurrency(outstandingTotal)} hint={`${outstandingInvoices.length} invoices awaiting payment`} />
            <FigureBlock label="Overdue" value={formatCurrency(overdueTotal)} hint={`${overdueInvoices.length} past their due date`} tone="negative" />
            <FigureBlock label="Collected" value={formatCurrency(paidTotal)} hint="Fully settled invoices" tone="positive" />
            <FigureBlock label="In draft" value={String(drafts.length)} hint="Not yet sent to customers" tone={drafts.length > 0 ? 'warning' : 'default'} />
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
          <InvoiceList invoices={invoices} customers={customers} onSelect={(id) => navigate(`/sales/invoices/${id}`)} />
        )}
      </div>

      {creating && (
        <InvoiceFormModal
          title="New invoice"
          customers={new Map(customerList.map((c) => [c.id, c.name]))}
          onSubmit={handleCreate}
          onClose={() => setCreating(false)}
          isLoading={saving}
        />
      )}
      {creating && saveError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError.message}
        </div>
      )}
    </>
  );
}
