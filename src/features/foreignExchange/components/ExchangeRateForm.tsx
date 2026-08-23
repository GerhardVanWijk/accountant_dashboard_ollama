import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ExchangeRate } from '@/types/foreignExchange';
import type { CreateExchangeRateDTO } from '../services';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface ExchangeRateFormProps {
  /** Present when editing an existing rate — prefills every field. Absent for a brand-new rate. */
  initialValue?: ExchangeRate;
  onSubmit: (data: CreateExchangeRateDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : today();
}

/**
 * Create (or edit) a single point-in-time exchange rate
 * (SA_ACCOUNTING_MASTER_SPEC.md §33). As a matter of process a wrong rate
 * should generally be superseded by a NEW rate for the same date rather
 * than edited — see ExchangeRateService's doc comment — but this form is
 * reused for both create and edit since the repository itself doesn't
 * forbid it.
 */
export function ExchangeRateForm({ initialValue, onSubmit, onCancel, isLoading = false }: ExchangeRateFormProps) {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-md">
      {error && <p className={fieldError}>{error}</p>}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label>
          <span className={fieldLabel}>From Currency</span>
          <input
            className={`${fieldInput} font-mono uppercase`}
            placeholder="e.g. USD"
            maxLength={6}
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
          />
        </label>
        <label>
          <span className={fieldLabel}>To Currency</span>
          <input
            className={`${fieldInput} font-mono uppercase`}
            placeholder="ZAR"
            maxLength={6}
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
          />
        </label>
        <label>
          <span className={fieldLabel}>Rate</span>
          <input
            type="number"
            min="0"
            step="0.0001"
            className={`${fieldInput} text-right tabular-nums`}
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
          />
          <span className={fieldHint}>Units of {toCurrency.trim() || 'ZAR'} per 1 unit of {fromCurrency.trim() || 'the from-currency'}.</span>
        </label>
        <label>
          <span className={fieldLabel}>Rate Date</span>
          <input type="date" className={fieldInput} value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
        </label>
      </div>

      <label>
        <span className={fieldLabel}>Source Reference</span>
        <textarea
          className={fieldInput}
          rows={2}
          placeholder="e.g. Manually entered from [bank/source] on [date] — not a live feed"
          value={sourceReference}
          onChange={(e) => setSourceReference(e.target.value)}
        />
        <span className={fieldHint}>
          Required — every rate is always manually entered, no live FX feed is wired into this codebase
          (SA_ACCOUNTING_MASTER_SPEC.md §110/§111). Say where this figure came from and note if it still needs
          professional review before relying on it for a real filing.
        </span>
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : initialValue ? 'Save Changes' : 'Create Rate'}
        </Button>
      </div>
    </form>
  );
}
