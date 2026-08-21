import { useState } from 'react';
import type { Customer, CreditNoteReason, Invoice } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CreateCreditNoteDTO } from '../services';
import { LineItemsEditor } from './LineItemsEditor';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const REASON_OPTIONS: { value: CreditNoteReason; label: string }[] = [
  { value: 'return', label: 'Returned Goods' },
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
];

export interface CreditNoteFormProps {
  customers: Customer[];
  /** All invoices, so the user can optionally tie this credit note to one issued against the selected customer. */
  invoices: Invoice[];
  defaultCreditNoteNumber: string;
  onSubmit: (data: CreateCreditNoteDTO) => Promise<void>;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Credit Note create form. Only builds and validates the
 * CreateCreditNoteDTO payload — it stays in 'draft' until the Detail
 * view's "Issue Credit Note" action posts it via
 * creditNoteService.issueCreditNote().
 */
export function CreditNoteForm({ customers, invoices, defaultCreditNoteNumber, onSubmit, onCancel }: CreditNoteFormProps) {
  const [creditNoteNumber, setCreditNoteNumber] = useState(defaultCreditNoteNumber);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [invoiceId, setInvoiceId] = useState<string>('');
  const [issueDate, setIssueDate] = useState(today());
  const [reason, setReason] = useState<CreditNoteReason>('return');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<CreateCreditNoteDTO['lineItems']>([
    { id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const customerInvoices = invoices.filter((inv) => inv.customerId === customerId);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit() {
    setFormError(null);
    if (!creditNoteNumber.trim()) return setFormError('Credit note number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        creditNoteNumber: creditNoteNumber.trim(),
        customerId,
        invoiceId: invoiceId || undefined,
        issueDate,
        reason,
        lineItems,
        subtotal,
        taxTotal,
        total,
        amountAllocated: 0,
        currency: 'ZAR',
        status: 'draft',
        allocations: [],
        notes: notes || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save credit note.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Credit Note Number</span>
          <input
            className={`${inputClass} font-mono`}
            value={creditNoteNumber}
            onChange={(e) => setCreditNoteNumber(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Customer</span>
          <select
            className={inputClass}
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setInvoiceId('');
            }}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Against Invoice (optional)</span>
          <select className={inputClass} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">Standalone account credit</option>
            {customerInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Reason</span>
          <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value as CreditNoteReason)}>
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Issue Date</span>
          <input type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
      </div>

      <LineItemsEditor lineItems={lineItems} onChange={setLineItems} />

      <div className="grid grid-cols-3 gap-md rounded-md border border-border bg-background p-md text-sm">
        <div>
          <div className="text-xs text-text-muted">Subtotal</div>
          <FinancialNumber value={subtotal} format={formatCurrency} className="text-base font-semibold" isInverted />
        </div>
        <div>
          <div className="text-xs text-text-muted">Tax</div>
          <FinancialNumber value={taxTotal} format={formatCurrency} className="text-base font-semibold" isInverted />
        </div>
        <div>
          <div className="text-xs text-text-muted">Total Credit</div>
          <FinancialNumber value={total} format={formatCurrency} className="text-base font-semibold" isInverted />
        </div>
      </div>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Notes (optional)</span>
        <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : 'Create Credit Note'}
        </Button>
      </div>
    </div>
  );
}
