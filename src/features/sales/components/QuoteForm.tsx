import { useState } from 'react';
import type { Customer, Quote } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { Amount } from '@/components/app/figure';
import { FormBody, FormFooter } from '@/components/app/form';
import type { CreateQuoteDTO } from '../services';
import { SalesLineItemsEditor } from './SalesLineItemsEditor';
import { useTaxRates } from '@/features/tax/hooks/useTaxRates';
import { useProducts } from '@/features/inventory/hooks/useProducts';
import { useWarehouses } from '@/features/inventory/hooks/useWarehouses';

export interface QuoteFormProps {
  customers: Customer[];
  quote?: Quote;
  defaultQuoteNumber: string;
  onSubmit: (data: CreateQuoteDTO) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Quote create/edit form — same fields/validation/submit shape as before
 * the port, JSX re-skinned onto v0's Field/Input primitives and the
 * v0-styled SalesLineItemsEditor (previously the plain LineItemsEditor,
 * now shared with Invoices/Credit Notes/Sales Orders — see M13 report).
 * Quotes never post to the GL — this only builds and validates the
 * CreateQuoteDTO payload for quoteService.createQuote()/updateQuote().
 */
export function QuoteForm({ customers, quote, defaultQuoteNumber, onSubmit, onCancel, onDirtyChange }: QuoteFormProps) {
  const { taxRates } = useTaxRates();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="quote-number">Quote number</FieldLabel>
          <Input
            id="quote-number"
            className="figure"
            value={quoteNumber}
            onChange={(e) => setQuoteNumber(e.target.value)}
            disabled={isSubmitting}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="quote-customer">Customer</FieldLabel>
          <NativeSelect
            id="quote-customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="quote-issue-date">Issue date</FieldLabel>
          <Input
            id="quote-issue-date"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            disabled={isSubmitting}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="quote-expiry-date">Expiry date</FieldLabel>
          <Input
            id="quote-expiry-date"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <SalesLineItemsEditor
        lineItems={lineItems}
        onChange={setLineItems}
        taxRates={taxRates}
        products={products}
        warehouses={warehouses}
        disabled={isSubmitting}
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
        <FieldLabel htmlFor="quote-notes">Notes (optional)</FieldLabel>
        <Textarea id="quote-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isSubmitting} />
      </Field>
      </FormBody>

      <FormFooter error={formError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : quote ? 'Save quote' : 'Create quote'}
        </Button>
      </FormFooter>
    </form>
  );
}
