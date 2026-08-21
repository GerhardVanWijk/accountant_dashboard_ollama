import { useState } from 'react';
import type { Invoice } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface OpenInvoiceOption {
  invoice: Invoice;
  outstanding: number;
}

export interface AllocationFormProps {
  /** Open invoices for this document's customer (total > amountPaid), with their outstanding balance pre-computed. */
  openInvoices: OpenInvoiceOption[];
  /** The maximum this allocation may apply — the credit note/receipt's remaining unallocated value. */
  maxAmount: number;
  onSubmit: (invoiceId: string, amount: number) => Promise<void>;
  onCancel: () => void;
}

/**
 * Shared "allocate against an open invoice" mini-form used by both
 * CreditNoteDetail (allocating a credit note's remaining value) and
 * CustomerReceiptDetail (applying a receipt's unallocated balance) — both
 * services expose an identical `allocateToInvoice(id, invoiceId, amount)`
 * shape, so one form covers both call sites.
 */
export function AllocationForm({ openInvoices, maxAmount, onSubmit, onCancel }: AllocationFormProps) {
  const [invoiceId, setInvoiceId] = useState(openInvoices[0]?.invoice.id ?? '');
  const [amount, setAmount] = useState<number>(
    Math.min(maxAmount, openInvoices[0]?.outstanding ?? maxAmount),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selected = openInvoices.find((o) => o.invoice.id === invoiceId);

  async function handleSubmit() {
    setFormError(null);
    if (!invoiceId) return setFormError('Select an invoice to allocate against.');
    if (amount <= 0) return setFormError('Amount must be greater than zero.');
    if (amount - maxAmount > 0.01) return setFormError(`Cannot allocate more than ${formatCurrency(maxAmount)} remaining.`);
    if (selected && amount - selected.outstanding > 0.01) {
      return setFormError(`Cannot allocate more than the invoice's outstanding balance of ${formatCurrency(selected.outstanding)}.`);
    }

    setIsSubmitting(true);
    try {
      await onSubmit(invoiceId, amount);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not allocate.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (openInvoices.length === 0) {
    return (
      <div className="flex flex-col gap-md">
        <p className="text-sm text-text-secondary">This customer has no open invoices to allocate against.</p>
        <div className="flex justify-end">
          <Button variant="ghost" type="button" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      {formError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="text-sm text-text-secondary">
        Remaining to allocate: <FinancialNumber value={maxAmount} format={formatCurrency} className="font-semibold" />
      </div>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Invoice</span>
        <select
          className={inputClass}
          value={invoiceId}
          onChange={(e) => {
            setInvoiceId(e.target.value);
            const opt = openInvoices.find((o) => o.invoice.id === e.target.value);
            if (opt) setAmount(Math.min(maxAmount, opt.outstanding));
          }}
        >
          {openInvoices.map((opt) => (
            <option key={opt.invoice.id} value={opt.invoice.id}>
              {opt.invoice.invoiceNumber} — outstanding {formatCurrency(opt.outstanding)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Amount to allocate</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className={inputClass}
          value={amount || ''}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
        />
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Allocating…' : 'Allocate'}
        </Button>
      </div>
    </div>
  );
}
