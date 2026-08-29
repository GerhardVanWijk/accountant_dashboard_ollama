import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { FormShell, FormHeader, FormBody, FormFooter } from '@/components/app/form';

export interface ReopenPeriodDialogProps {
  periodName: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Reopening a closed/locked period ALWAYS requires a reason —
 * AccountingPeriodService.reopenPeriod() throws without one
 * (docs/SA_ACCOUNTING_MASTER_SPEC.md §35). Enforced there, not just here;
 * this dialog only makes it impossible to submit blank. P3F: on the shared
 * `FormShell` (`sm`).
 */
export function ReopenPeriodDialog({ periodName, onConfirm, onClose }: ReopenPeriodDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const invalid = touched && !trimmed;

  async function handleConfirm(): Promise<void> {
    setTouched(true);
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen period.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormShell open onClose={onClose} size="sm" mode="edit" isDirty={Boolean(reason)} pending={submitting}>
      <FormHeader
        title={`Reopen ${periodName}`}
        description="Reopening allows posting into this period again. The reason is recorded in the audit trail."
      />
      <FormBody>
        <Field>
          <FieldLabel htmlFor="reopen-reason">Reason</FieldLabel>
          <Textarea
            id="reopen-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={invalid}
          />
          {invalid && <FieldError>A reason is required to reopen a period.</FieldError>}
        </Field>
      </FormBody>
      <FormFooter error={error ?? undefined}>
        <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'Reopening…' : 'Reopen period'}
        </Button>
      </FormFooter>
    </FormShell>
  );
}
