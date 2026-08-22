import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface RunDepreciationFormProps {
  defaultPeriodEnd: string;
  onSubmit: (periodEnd: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Triggers depreciationService.runDepreciation() for the chosen
 * period-end date across every eligible active asset in one combined
 * journal entry — see DepreciationPage for how the result is surfaced.
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
    <div className="flex flex-col gap-md">
      <div>
        <label className={fieldLabel} htmlFor="periodEnd">
          Period End Date
        </label>
        <input
          id="periodEnd"
          type="date"
          className={fieldInput}
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
        />
        <p className={fieldHint}>
          Depreciates every active asset not already run for this exact date, one month's charge each. Running twice
          for the same date is safe — the second run finds nothing left to do.
        </p>
      </div>
      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting || !periodEnd}>
          Run Depreciation
        </Button>
      </div>
    </div>
  );
}
