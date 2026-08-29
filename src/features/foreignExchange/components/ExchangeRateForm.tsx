import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { FormBody, FormFooter } from '@/components/app/form';
import type { ExchangeRate } from '@/types/foreignExchange';
import type { CreateExchangeRateDTO } from '../services';

export interface ExchangeRateFormProps {
  /** Present when editing an existing rate — prefills every field. Absent for a brand-new rate. */
  initialValue?: ExchangeRate;
  onSubmit: (data: CreateExchangeRateDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : today();
}

/**
 * Create (or edit) a single point-in-time exchange rate. As a matter of
 * process a wrong rate should generally be superseded by a NEW rate for
 * the same date rather than edited — see ExchangeRateService's doc
 * comment — but this form is reused for both create and edit since the
 * repository itself doesn't forbid it. Re-skinned onto v0's
 * Field/Input/Textarea (M13); validation and submit wiring unchanged —
 * this is still a plain useState form (no react-hook-form), matching the
 * form's original shape.
 */
export function ExchangeRateForm({ initialValue, onSubmit, onCancel, isLoading = false, onDirtyChange }: ExchangeRateFormProps) {
  const [fromCurrency, setFromCurrency] = useState(initialValue?.fromCurrency ?? '');
  const [toCurrency, setToCurrency] = useState(initialValue?.toCurrency ?? 'ZAR');
  const [rate, setRate] = useState(initialValue?.rate ?? 0);
  const [rateDate, setRateDate] = useState(toDateInputValue(initialValue?.rateDate));
  const [sourceReference, setSourceReference] = useState(initialValue?.sourceReference ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromCurrency.trim() || !toCurrency.trim()) {
      setError('From-currency and to-currency are both required.');
      return;
    }
    if (!rate || rate <= 0) {
      setError('Rate must be greater than 0.');
      return;
    }
    if (!sourceReference.trim()) {
      setError('Source reference is required — this rate is always manually entered, say where it came from.');
      return;
    }
    await onSubmit({
      fromCurrency: fromCurrency.trim().toUpperCase(),
      toCurrency: toCurrency.trim().toUpperCase(),
      rate,
      rateDate: new Date(rateDate).toISOString(),
      sourceReference: sourceReference.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="fromCurrency">From Currency</FieldLabel>
          <Input id="fromCurrency" className="font-mono uppercase" placeholder="e.g. USD" maxLength={6} value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="toCurrency">To Currency</FieldLabel>
          <Input id="toCurrency" className="font-mono uppercase" placeholder="ZAR" maxLength={6} value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rate">Rate</FieldLabel>
          <Input id="rate" type="number" min="0" step="0.0001" className="text-right" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} />
          <FieldDescription>
            Units of {toCurrency.trim() || 'ZAR'} per 1 unit of {fromCurrency.trim() || 'the from-currency'}.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="rateDate">Rate Date</FieldLabel>
          <Input id="rateDate" type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="sourceReference">Source Reference</FieldLabel>
        <Textarea id="sourceReference" rows={2} placeholder="e.g. Manually entered from [bank/source] on [date] — not a live feed" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} />
        <FieldDescription>
          Required — every rate is always manually entered, no live FX feed is wired into this codebase. Say where
          this figure came from and note if it still needs professional review before relying on it for a real
          filing.
        </FieldDescription>
      </Field>
      </FormBody>

      <FormFooter error={error ?? undefined}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : initialValue ? 'Save Changes' : 'Create Rate'}
        </Button>
      </FormFooter>
    </form>
  );
}
