import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { TaxRate } from '@/types';
import type { SupersedeTaxRateInput } from '../services';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface SupersedeTaxRateFormProps {
  currentVersion: TaxRate;
  onSubmit: (input: SupersedeTaxRateInput, reason: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Changes a rate code's rate/treatment going forward WITHOUT touching the
 * currently-open version — TaxRateService.supersede() closes it and
 * creates a new one (SA_ACCOUNTING_MASTER_SPEC.md §83: a past transaction
 * must keep using the rate that was in effect when it was posted). A
 * reason is mandatory, matching every other reason-required override in
 * this codebase (e.g. CompanyService.setReportingFramework()).
 */
export function SupersedeTaxRateForm({ currentVersion, onSubmit, onCancel, isLoading = false }: SupersedeTaxRateFormProps) {
  const [rate, setRate] = useState(currentVersion.rate);
  const [effectiveFrom, setEffectiveFrom] = useState(tomorrow());
  const [sourceReference, setSourceReference] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sourceReference.trim() || !reason.trim()) {
      setError('Source reference and reason are both required.');
      return;
    }
    await onSubmit(
      {
        rate,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        sourceReference: sourceReference.trim(),
        treatment: currentVersion.treatment,
        appliesTo: currentVersion.appliesTo,
        jurisdiction: currentVersion.jurisdiction,
        name: currentVersion.name,
      },
      reason.trim(),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-md">
      <p className="rounded-md border border-border bg-background px-sm py-xs text-xs text-text-secondary">
        Current version: <span className="font-mono">{currentVersion.code}</span> at {currentVersion.rate}%, effective
        from {new Date(currentVersion.effectiveFrom).toLocaleDateString()}. This will NOT be edited — it stays exactly
        as posted; a new version starts on the date below.
      </p>

      {error && <p className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">New Rate (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className={`${inputClass} text-right`}
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
          />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Effective From</span>
          <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </label>
      </div>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Source Reference</span>
        <input
          className={inputClass}
          placeholder="e.g. VAT Act amendment — pending professional verification"
          value={sourceReference}
          onChange={(e) => setSourceReference(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Reason for Change</span>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Required — recorded on the audit trail"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Supersede Rate'}
        </Button>
      </div>
    </form>
  );
}
