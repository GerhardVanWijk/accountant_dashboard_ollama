import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';

export interface RunAmortizationFormProps {
  defaultPeriodEnd: string;
  onSubmit: (periodEnd: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Triggers leaseAmortizationService.runAmortization() for the chosen
 * period-end date across every eligible active lease in one combined
 * journal entry — mirrors RunDepreciationForm.tsx. Re-skinned onto v0's
 * Field/Input (M13); no lease math here.
 */
export function RunAmortizationForm({ defaultPeriodEnd, onSubmit, onCancel }: RunAmortizationFormProps) {
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(periodEnd);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="periodEnd">Period End Date</FieldLabel>
        <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        <FieldDescription>
          Amortizes every active lease not already run for this exact date, one month&apos;s interest/principal
          split and ROU depreciation charge each. Running twice for the same date is safe — the second run finds
          nothing left to do.
        </FieldDescription>
      </Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !periodEnd} onClick={() => void submit()}>
          Run Amortization
        </Button>
      </div>
    </div>
  );
}
