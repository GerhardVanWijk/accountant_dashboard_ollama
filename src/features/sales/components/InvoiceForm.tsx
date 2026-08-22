import { useState } from 'react';
import type { Invoice } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CreateInvoiceDTO } from '@/services/invoiceService';
import { LineItemsEditor } from './LineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

interface InvoiceFormProps {
  invoice?: Invoice;
  customers: Map<string, string>; // customerId -> customerName
  onSubmit: (data: Partial<Invoice>) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Invoice create/edit form. Rebuilt to match every other Sales/Purchases
 * form's pattern (QuoteForm/SalesOrderForm/CreditNoteForm/
 * PurchaseOrderForm) — previously this had its own separate inline
 * line-item editor that hardcoded 15% VAT and never picked up the real
 * TaxRate engine, and had no way to tie a line to a real Product at all
 * (see docs/KNOWN_ISSUES.md: without a productId, Cost of Sales/inventory
 * posting can never fire for an invoice created through the UI). Now
 * shares `LineItemsEditor` with real `useTaxRates()`/`useProducts()`, same
 * as every sibling form.
 *
 * Status is deliberately NOT editable here — it used to be a raw dropdown
 * that let a caller jump an invoice straight to 'sent'/'paid' without ever
 * calling `invoiceService.postInvoice()`, bypassing GL posting/Cost of
 * Sales/stock reduction entirely. Status transitions belong to the
 * dedicated actions on `InvoiceDetail` (Mark as Sent, Record Payment) that
 * go through the real service methods.
 */
export const InvoiceForm = ({ invoice, customers, onSubmit, onCancel, isLoading = false }: InvoiceFormProps) => {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const customerEntries = Array.from(customers.entries());

  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber ?? '');
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? customerEntries[0]?.[0] ?? '');
  const [issueDate, setIssueDate] = useState(invoice ? invoice.issueDate.slice(0, 10) : today());
  const [dueDate, setDueDate] = useState(invoice ? invoice.dueDate.slice(0, 10) : plusDays(30));
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [lineItems, setLineItems] = useState<CreateInvoiceDTO['lineItems']>(
    invoice?.lineItems ?? [{ id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 }],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!invoiceNumber.trim()) return setFormError('Invoice number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (!issueDate) return setFormError('Issue date is required.');
    if (!dueDate) return setFormError('Due date is required.');
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    onSubmit({
      invoiceNumber: invoiceNumber.trim(),
      customerId,
      issueDate: `${issueDate}T00:00:00.000Z`,
      dueDate: `${dueDate}T00:00:00.000Z`,
      lineItems,
      subtotal,
      taxTotal,
      total,
      currency: invoice?.currency ?? 'ZAR',
      status: invoice?.status ?? 'draft',
      notes: notes || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-lg">
      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Invoice Number</span>
          <input
            className={`${inputClass} font-mono`}
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            disabled={isLoading}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Customer</span>
          <select
            className={inputClass}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select Customer</option>
            {customerEntries.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Issue Date</span>
          <input
            type="date"
            className={inputClass}
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            disabled={isLoading}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Due Date</span>
          <input
            type="date"
            className={inputClass}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isLoading}
          />
        </label>
      </div>

      <LineItemsEditor
        lineItems={lineItems}
        onChange={setLineItems}
        taxRates={taxRates}
        products={products}
        warehouses={warehouses}
        disabled={isLoading}
      />

      <div className="grid grid-cols-3 gap-md rounded-md border border-border bg-background p-md text-sm">
        <div>
          <div className="text-xs text-text-muted">Subtotal</div>
          <FinancialNumber value={subtotal} format={formatCurrency} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-text-muted">Tax</div>
          <FinancialNumber value={taxTotal} format={formatCurrency} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-text-muted">Total</div>
          <FinancialNumber value={total} format={formatCurrency} className="text-base font-semibold" />
        </div>
      </div>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Notes (optional)</span>
        <textarea
          className={inputClass}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isLoading}
        />
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        {onCancel && (
          <Button variant="ghost" type="button" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : invoice ? 'Save Invoice' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
};
