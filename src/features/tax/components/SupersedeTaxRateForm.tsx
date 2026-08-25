import { useState } from 'react';
import type { TaxRate } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { formatDate } from '@/lib/app/format';
import type { SupersedeTaxRateInput } from '../services';

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
 * creates a new one. A reason is mandatory, matching every other
 * reason-required override in this codebase (e.g.
 * CompanyService.setReportingFramework()). Re-skinned onto v0's
 * Field/Input/Textarea (M7); validation logic unchanged.
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Current version: <span className="font-mono">{currentVersion.code}</span> at {currentVersion.rate}%, effective from {formatDate(currentVersion.effectiveFrom)}. This will NOT be
        edited — it stays exactly as posted; a new version starts on the date below.
      </p>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="supersede-rate">New Rate (%)</FieldLabel>
          <Input id="supersede-rate" type="number" min="0" max="100" step="0.01" className="text-right" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="supersede-effective-from">Effective From</FieldLabel>
          <Input id="supersede-effective-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="supersede-source">Source Reference</FieldLabel>
        <Input id="supersede-source" placeholder="e.g. VAT Act amendment — pending professional verification" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} />
      </Field>

      <Field>
        <FieldLabel htmlFor="supersede-reason">Reason for Change</FieldLabel>
        <Textarea id="supersede-reason" rows={2} placeholder="Required — recorded on the audit trail" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Supersede Rate'}
        </Button>
      </div>
    </form>
  );
}
