import { useState } from 'react';
import type { Invoice } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';
import { formatCurrency } from '@/lib/app/format';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
 * CustomerReceiptDetail (applying a receipt's unallocated balance) — same
 * fields/validation as before the port, JSX re-skinned. Both services
 * expose an identical `allocateToInvoice(id, invoiceId, amount)` shape, so
 * one form covers both call sites.
 */
export function AllocationForm({ openInvoices, maxAmount, onSubmit, onCancel }: AllocationFormProps) {
  const [invoiceId, setInvoiceId] = useState(openInvoices[0]?.invoice.id ?? '');
  const [amount, setAmount] = useState<number>(Math.min(maxAmount, openInvoices[0]?.outstanding ?? maxAmount));
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
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">This customer has no open invoices to allocate against.</p>
        <div className="flex justify-end">
          <Button variant="outline" type="button" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="text-sm text-muted-foreground">
        Remaining to allocate: <Amount value={maxAmount} className="font-semibold text-foreground" />
      </div>

      <Field>
        <FieldLabel htmlFor="allocation-invoice">Invoice</FieldLabel>
        <select
          id="allocation-invoice"
          className={selectClassName}
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
      </Field>

      <Field>
        <FieldLabel htmlFor="allocation-amount">Amount to allocate</FieldLabel>
        <Input
          id="allocation-amount"
          type="number"
          min="0"
          step="0.01"
          value={amount || ''}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
        />
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Allocating…' : 'Allocate'}
        </Button>
      </div>
    </div>
  );
}
