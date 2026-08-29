import { useState } from 'react';
import type { Invoice } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateInvoiceDTO } from '@/services/invoiceService';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

interface InvoiceFormProps {
  invoice?: Invoice;
  customers: Map<string, string>; // customerId -> customerName
  onSubmit: (data: Partial<Invoice>) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Invoice create/edit form — same fields/validation/submit shape as before
 * the port, JSX re-skinned onto v0's Field/Input primitives and the new
 * v0-styled `SalesLineItemsEditor`. Status is deliberately NOT editable
 * here (unchanged from before the port) — a raw status dropdown would let
 * a caller jump an invoice straight to 'sent'/'paid' without ever calling
 * `invoiceService.postInvoice()`, bypassing GL posting/Cost of Sales/stock
 * reduction entirely. Status transitions belong to the dedicated actions
 * on InvoiceDetail (Mark as Sent, Record Payment) that go through the real
 * service methods.
 */
export const InvoiceForm = ({ invoice, customers, onSubmit, onCancel, isLoading = false, onDirtyChange }: InvoiceFormProps) => {
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
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="invoice-number">Invoice number</FieldLabel>
          <Input
            id="invoice-number"
            className="figure"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            disabled={isLoading}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invoice-customer">Customer</FieldLabel>
          <NativeSelect
            id="invoice-customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Select customer</option>
            {customerEntries.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="invoice-issue-date">Issue date</FieldLabel>
          <Input
            id="invoice-issue-date"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            disabled={isLoading}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invoice-due-date">Due date</FieldLabel>
          <Input
            id="invoice-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isLoading}
          />
        </Field>
      </div>

      <SalesLineItemsEditor
        lineItems={lineItems}
        onChange={setLineItems}
        taxRates={taxRates}
        products={products}
        warehouses={warehouses}
        disabled={isLoading}
      />

      <div className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Subtotal</div>
          <Amount value={subtotal} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tax</div>
          <Amount value={taxTotal} className="text-base font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <Amount value={total} className="text-base font-semibold" />
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="invoice-notes">Notes (optional)</FieldLabel>
        <Textarea id="invoice-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isLoading} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        {onCancel && (
          <Button variant="outline" type="button" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : invoice ? 'Save invoice' : 'Create invoice'}
        </Button>
      </FormFooter>
    </form>
  );
};
