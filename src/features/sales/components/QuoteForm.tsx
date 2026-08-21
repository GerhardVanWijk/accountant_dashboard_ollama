import { useState } from 'react';
import type { Customer, Quote } from '@/types';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { CreateQuoteDTO } from '../services';
import { LineItemsEditor } from './LineItemsEditor';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface QuoteFormProps {
  customers: Customer[];
  quote?: Quote;
  defaultQuoteNumber: string;
  onSubmit: (data: CreateQuoteDTO) => Promise<void>;
  onCancel: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Quote create/edit form. Quotes never post to the GL — this only builds
 * and validates the CreateQuoteDTO payload for quoteService.createQuote()
 * / updateQuote().
 */
export function QuoteForm({ customers, quote, defaultQuoteNumber, onSubmit, onCancel }: QuoteFormProps) {
  const [quoteNumber, setQuoteNumber] = useState(quote?.quoteNumber ?? defaultQuoteNumber);
  const [customerId, setCustomerId] = useState(quote?.customerId ?? customers[0]?.id ?? '');
  const [issueDate, setIssueDate] = useState(quote ? quote.issueDate.slice(0, 10) : today());
  const [expiryDate, setExpiryDate] = useState(quote ? quote.expiryDate.slice(0, 10) : plusDays(30));
  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [lineItems, setLineItems] = useState<CreateQuoteDTO['lineItems']>(
    quote?.lineItems ?? [{ id: `li_${Date.now()}`, description: '', quantity: 1, unitPrice: 0, taxAmount: 0, lineTotal: 0 }],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + taxTotal;

  async function handleSubmit() {
    setFormError(null);
    if (!quoteNumber.trim()) return setFormError('Quote number is required.');
    if (!customerId) return setFormError('Select a customer.');
    if (lineItems.length === 0 || lineItems.some((li) => !li.description.trim() || li.quantity <= 0)) {
      return setFormError('Every line item needs a description and a quantity greater than zero.');
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        quoteNumber: quoteNumber.trim(),
        customerId,
        issueDate,
        expiryDate,
        lineItems,
        subtotal,
        taxTotal,
        total,
        currency: 'ZAR',
        status: quote?.status ?? 'draft',
        notes: notes || undefined,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save quote.');
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
          <span className="font-medium text-text-primary">Quote Number</span>
          <input className={`${inputClass} font-mono`} value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Customer</span>
          <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Issue Date</span>
          <input type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Expiry Date</span>
          <input type="date" className={inputClass} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </label>
      </div>

      <LineItemsEditor lineItems={lineItems} onChange={setLineItems} />

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
        <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="button" disabled={isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? 'Saving…' : quote ? 'Save Quote' : 'Create Quote'}
        </Button>
      </div>
    </div>
  );
}
