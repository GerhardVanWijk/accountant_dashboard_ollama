import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Textarea } from '@/components/ui/shadcn/textarea';

export interface ReopenPeriodDialogProps {
  periodName: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Reopening a closed/locked period ALWAYS requires a reason —
 * AccountingPeriodService.reopenPeriod() throws without one
 * (docs/SA_ACCOUNTING_MASTER_SPEC.md §35). Enforced there, not just here;
 * this dialog only makes it impossible to submit blank.
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {periodName}</DialogTitle>
          <DialogDescription>
            Reopening allows posting into this period again. The reason is recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>

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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Reopening…' : 'Reopen period'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
