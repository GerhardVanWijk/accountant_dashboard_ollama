import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';

export interface RunDepreciationFormProps {
  defaultPeriodEnd: string;
  onSubmit: (periodEnd: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Triggers depreciationService.runDepreciation() for the chosen
 * period-end date across every eligible active asset in one combined
 * journal entry — see DepreciationPage for how the result is surfaced.
 * Re-skinned onto v0's Field/Input (M8); no depreciation math here.
 */
export function RunDepreciationForm({ defaultPeriodEnd, onSubmit, onCancel }: RunDepreciationFormProps) {
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
          Depreciates every active asset not already run for this exact date, one month&apos;s charge each. Running
          twice for the same date is safe — the second run finds nothing left to do.
        </FieldDescription>
      </Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !periodEnd} onClick={() => void submit()}>
          Run Depreciation
        </Button>
      </div>
    </div>
  );
}
