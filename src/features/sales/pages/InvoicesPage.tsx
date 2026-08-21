import { useState } from 'react';
import type { Invoice } from '@/types';
import { InvoiceList } from '@/features/sales/components/InvoiceList';
import { InvoiceDetail } from '@/features/sales/components/InvoiceDetail';
import { InvoiceForm } from '@/features/sales/components/InvoiceForm';
import { useInvoices, useInvoice, useInvoiceMutations } from '@/features/sales/hooks/useInvoices';
import { useCustomerMap, useCustomerList } from '@/features/sales/hooks/useCustomerMap';
import { useCompany } from '@/features/admin/hooks/useCompany';
import type { CreateInvoiceDTO } from '@/services/invoiceService';

type View = { type: 'list' } | { type: 'detail'; invoiceId: string };
type FormState = { mode: 'create' } | { mode: 'edit'; invoice: Invoice } | null;

/**
 * Route target for /sales/invoices. Orchestrates the invoice module's
 * list/detail views and create/edit form.
 */
export function InvoicesPage() {
  const [view, setView] = useState<View>({ type: 'list' });
  const [formState, setFormState] = useState<FormState>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const { invoices, loading, error, refetch: refetchList } = useInvoices();
  const { invoice: detailInvoice } = useInvoice(
    view.type === 'detail' ? view.invoiceId : undefined,
  );
  const { customers } = useCustomerMap();
  const { customers: customerList } = useCustomerList();
  const { createInvoice, updateInvoice, saving, error: saveError } = useInvoiceMutations();
  const { company } = useCompany();

  async function handleFormSubmit(values: Partial<Invoice>): Promise<void> {
    if (formState?.mode === 'edit') {
      await updateInvoice(formState.invoice.id, values);
    } else {
      // When creating, ensure all required fields are present
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

  const getCustomerName = (customerId: string): string => {
    return customers.get(customerId) || 'Unknown Customer';
  };

  const customerMap = new Map(customerList.map((c) => [c.id, c.name]));

  return (
    <>
      {view.type === 'list' && (
        <div className="space-y-4" key={dataVersion}>
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Sales Invoices</h1>
            <button
              onClick={() => setFormState({ mode: 'create' })}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors"
            >
              New Invoice
            </button>
          </div>

          {error && (
            <div className="p-4 bg-danger/10 border border-danger/30 rounded text-danger">{error}</div>
          )}

          <InvoiceList
            invoices={invoices}
            customers={customers}
            onSelect={(id) => setView({ type: 'detail', invoiceId: id })}
            isLoading={loading}
            error={error || undefined}
          />
        </div>
      )}

      {view.type === 'detail' && detailInvoice && (
        <div className="space-y-4" key={`${view.invoiceId}-${dataVersion}`}>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setView({ type: 'list' })}
              className="px-4 py-2 border border-border rounded hover:bg-panel transition-colors"
            >
              Back to List
            </button>
          </div>

          <InvoiceDetail
            invoice={detailInvoice}
            customerName={getCustomerName(detailInvoice.customerId)}
            company={company}
            onEdit={() => setFormState({ mode: 'edit', invoice: detailInvoice })}
          />
        </div>
      )}

      {formState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-panel rounded-lg border border-border max-h-[90vh] overflow-y-auto max-w-2xl w-full">
            <div className="p-6 border-b border-border flex justify-between items-center sticky top-0 bg-panel">
              <h2 className="text-lg font-bold">
                {formState.mode === 'create' ? 'New Invoice' : `Edit ${formState.invoice.invoiceNumber}`}
              </h2>
              <button
                onClick={() => setFormState(null)}
                className="text-text-muted hover:text-text transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {saveError && (
                <div className="mb-4 p-4 bg-danger/10 border border-danger/30 rounded text-danger">
                  {saveError.message}
                </div>
              )}

              <InvoiceForm
                invoice={formState.mode === 'edit' ? formState.invoice : undefined}
                customers={customerMap}
                onSubmit={handleFormSubmit}
                onCancel={() => setFormState(null)}
                isLoading={saving}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
