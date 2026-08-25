import { useState } from 'react';
import type { TaxAppliesTo, VatTreatment } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import type { CreateTaxRateDTO } from '../services';
import { treatmentLabels, VAT_TREATMENTS } from '../utils/treatmentLabels';

const selectClassName = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
 * SupersedeTaxRateForm instead. Re-skinned onto v0's Field/Input (M7);
 * validation logic is byte-for-byte unchanged (same required-field checks,
 * same TaxRateService.createTaxRate() call site via the page).
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="rate-code">Code</FieldLabel>
          <Input id="rate-code" className="font-mono uppercase" placeholder="e.g. STD" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-name">Name</FieldLabel>
          <Input id="rate-name" placeholder="e.g. Standard Rate (15%)" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-treatment">VAT Treatment</FieldLabel>
          <select id="rate-treatment" className={selectClassName} value={treatment} onChange={(e) => setTreatment(e.target.value as VatTreatment)}>
            {VAT_TREATMENTS.map((t) => (
              <option key={t} value={t}>
                {treatmentLabels[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-percent">Rate (%)</FieldLabel>
          <Input id="rate-percent" type="number" min="0" max="100" step="0.01" className="text-right" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-applies-to">Applies To</FieldLabel>
          <select id="rate-applies-to" className={selectClassName} value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as TaxAppliesTo)}>
            <option value="both">Sales &amp; Purchases</option>
            <option value="sales">Sales Only</option>
            <option value="purchases">Purchases Only</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-effective-from">Effective From</FieldLabel>
          <Input id="rate-effective-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-jurisdiction">Jurisdiction</FieldLabel>
          <Input id="rate-jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="rate-source">Source Reference</FieldLabel>
        <Input id="rate-source" placeholder="e.g. VAT Act 89 of 1991 — pending professional verification" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} />
        <FieldDescription>
          Required — every rate must be traceable to a source (SA_ACCOUNTING_MASTER_SPEC.md §109). If you haven't independently verified this rate/date against SARS or the VAT Act, say
          so here rather than presenting it as confirmed.
        </FieldDescription>
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Create Tax Code'}
        </Button>
      </div>
    </form>
  );
}
