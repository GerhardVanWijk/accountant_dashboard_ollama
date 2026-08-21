import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { TaxAppliesTo, VatTreatment } from '@/types';
import type { CreateTaxRateDTO } from '../services';
import { treatmentLabels, VAT_TREATMENTS } from '../utils/treatmentLabels';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface TaxRateFormProps {
  onSubmit: (data: CreateTaxRateDTO) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Registers a brand-new tax code (one that has never existed before) —
 * for changing an EXISTING code's rate going forward, use
 * SupersedeTaxRateForm instead (this form's `code` must be unique; the
 * service doesn't enforce that itself since a real code can legitimately
 * be re-created after being fully removed, but the page filters existing
 * codes out of suggestions).
 */
export function TaxRateForm({ onSubmit, onCancel, isLoading = false }: TaxRateFormProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [treatment, setTreatment] = useState<VatTreatment>('standard_rated');
  const [rate, setRate] = useState(0);
  const [appliesTo, setAppliesTo] = useState<TaxAppliesTo>('both');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [jurisdiction, setJurisdiction] = useState('ZA');
  const [sourceReference, setSourceReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !name.trim() || !sourceReference.trim()) {
      setError('Code, name, and source reference are all required.');
      return;
    }
    await onSubmit({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      treatment,
      rate,
      appliesTo,
      effectiveFrom: new Date(effectiveFrom).toISOString(),
      jurisdiction,
      sourceReference: sourceReference.trim(),
      isActive: true,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-md">
      {error && <p className="rounded-md border border-danger bg-danger/10 px-sm py-xs text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Code</span>
          <input className={`${inputClass} font-mono uppercase`} placeholder="e.g. STD" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Name</span>
          <input className={inputClass} placeholder="e.g. Standard Rate (15%)" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">VAT Treatment</span>
          <select className={inputClass} value={treatment} onChange={(e) => setTreatment(e.target.value as VatTreatment)}>
            {VAT_TREATMENTS.map((t) => (
              <option key={t} value={t}>
                {treatmentLabels[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Rate (%)</span>
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
          <span className="font-medium text-text-primary">Applies To</span>
          <select className={inputClass} value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as TaxAppliesTo)}>
            <option value="both">Sales &amp; Purchases</option>
            <option value="sales">Sales Only</option>
            <option value="purchases">Purchases Only</option>
          </select>
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Effective From</span>
          <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium text-text-primary">Jurisdiction</span>
          <input className={inputClass} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
        </label>
      </div>

      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium text-text-primary">Source Reference</span>
        <input
          className={inputClass}
          placeholder="e.g. VAT Act 89 of 1991 — pending professional verification"
          value={sourceReference}
          onChange={(e) => setSourceReference(e.target.value)}
        />
        <span className="text-xs text-text-muted">
          Required — every rate must be traceable to a source (SA_ACCOUNTING_MASTER_SPEC.md §109). If you haven't
          independently verified this rate/date against SARS or the VAT Act, say so here rather than presenting it as
          confirmed.
        </span>
      </label>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Create Tax Code'}
        </Button>
      </div>
    </form>
  );
}
