import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';

export interface RunAmortizationFormProps {
  defaultPeriodEnd: string;
  onSubmit: (periodEnd: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Triggers leaseAmortizationService.runAmortization() for the chosen
 * period-end date across every eligible active lease in one combined
 * journal entry — mirrors RunDepreciationForm.tsx. Re-skinned onto v0's
 * Field/Input (M13); no lease math here.
 */
export function RunAmortizationForm({ defaultPeriodEnd, onSubmit, onCancel, onDirtyChange }: RunAmortizationFormProps) {
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
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <Field>
        <FieldLabel htmlFor="periodEnd">Period End Date</FieldLabel>
        <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        <FieldDescription>
          Amortizes every active lease not already run for this exact date, one month&apos;s interest/principal
          split and ROU depreciation charge each. Running twice for the same date is safe — the second run finds
          nothing left to do.
        </FieldDescription>
      </Field>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !periodEnd} onClick={() => void submit()}>
          Run Amortization
        </Button>
      </FormFooter>
    </div>
  );
}
