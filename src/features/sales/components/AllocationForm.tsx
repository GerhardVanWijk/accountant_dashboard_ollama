import { useState } from 'react';
import type { Invoice } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { SearchableSelect } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';

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
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Shared "allocate against an open invoice" mini-form used by both
 * CreditNoteDetail (allocating a credit note's remaining value) and
 * CustomerReceiptDetail (applying a receipt's unallocated balance) — same
 * fields/validation as before the port, JSX re-skinned. Both services
 * expose an identical `allocateToInvoice(id, invoiceId, amount)` shape, so
 * one form covers both call sites.
 */
export function AllocationForm({ openInvoices, maxAmount, onSubmit, onCancel, onDirtyChange }: AllocationFormProps) {
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
      <div className="flex min-h-0 flex-1 flex-col">
        <FormBody>
          <p className="text-sm text-muted-foreground">This customer has no open invoices to allocate against.</p>
        </FormBody>
        <FormFooter>
          <Button variant="outline" type="button" onClick={onCancel}>
            Close
          </Button>
        </FormFooter>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="text-sm text-muted-foreground">
        Remaining to allocate: <Amount value={maxAmount} className="font-semibold text-foreground" />
      </div>

      <Field>
        <FieldLabel htmlFor="allocation-invoice">Invoice</FieldLabel>
        <SearchableSelect
          id="allocation-invoice"
          value={invoiceId || null}
          onChange={(v) => {
            setInvoiceId(v ?? '');
            const opt = openInvoices.find((o) => o.invoice.id === v);
            if (opt) setAmount(Math.min(maxAmount, opt.outstanding));
          }}
          placeholder="Select an invoice…"
          searchPlaceholder="Search invoice number…"
          options={openInvoices.map((opt) => ({
            value: opt.invoice.id,
            label: opt.invoice.invoiceNumber,
            meta: `outstanding ${formatCurrency(opt.outstanding)}`,
          }))}
        />
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
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Allocating…' : 'Allocate'}
        </Button>
      </FormFooter>
    </div>
  );
}
