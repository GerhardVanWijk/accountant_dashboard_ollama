import { useState } from 'react';
import type { ReportingStandardName } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';

export interface AddReportingStandardVersionFormProps {
  standard: ReportingStandardName;
  onSubmit: (
    input: {
      standard: ReportingStandardName;
      versionLabel: string;
      effectiveFrom: string;
      earlyAdoptionPermitted: boolean;
      sourceReference: string;
      notes?: string;
    },
    reason: string,
  ) => Promise<void>;
  onCancel: () => void;
}

/**
 * Adds a new edition of a reporting standard — never edits an existing
 * version's own fields, only marks the prior newest version as
 * superseded. A reason is required, same "authorized override"
 * discipline as `ReportingFrameworkOverrideForm`/`SbcEligibilityForm`
 * elsewhere in this codebase. Re-skinned onto v0's Field/Input/Textarea/
 * Checkbox (M7); validation logic unchanged.
 */
export function AddReportingStandardVersionForm({ standard, onSubmit, onCancel }: AddReportingStandardVersionFormProps) {
  const [versionLabel, setVersionLabel] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [earlyAdoptionPermitted, setEarlyAdoptionPermitted] = useState(false);
  const [sourceReference, setSourceReference] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async () => {
    if (!versionLabel.trim() || !effectiveFrom || !sourceReference.trim()) {
      setValidationError('Version label, effective-from date, and source reference are all required.');
      return;
    }
    if (!reason.trim()) {
      setValidationError('A reason is required to add a new edition.');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await onSubmit(
        { standard, versionLabel: versionLabel.trim(), effectiveFrom: new Date(effectiveFrom).toISOString(), earlyAdoptionPermitted, sourceReference: sourceReference.trim() },
        reason,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        This does not remove or edit any prior edition of {standard === 'full_ifrs' ? 'Full IFRS' : 'IFRS for SMEs'} — it only records a new one and marks the previous one superseded,
        so any past reporting period still resolves against whichever edition was actually in effect at the time.
      </p>
      <Field>
        <FieldLabel htmlFor="rsvLabel">Version label</FieldLabel>
        <Input id="rsvLabel" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g. IFRS for SMEs (2030 edition)" />
      </Field>
      <Field>
        <FieldLabel htmlFor="rsvEffectiveFrom">Effective from (periods beginning on/after)</FieldLabel>
        <Input id="rsvEffectiveFrom" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={earlyAdoptionPermitted} onCheckedChange={(value) => setEarlyAdoptionPermitted(value === true)} />
        Early adoption permitted
      </label>
      <Field>
        <FieldLabel htmlFor="rsvSource">Source reference</FieldLabel>
        <Input id="rsvSource" value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} placeholder="e.g. IASB announcement / official standard text URL" />
      </Field>
      <Field>
        <FieldLabel htmlFor="rsvReason">Reason (required)</FieldLabel>
        <Textarea id="rsvReason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {validationError && (
          <p role="alert" className="text-sm text-destructive">
            {validationError}
          </p>
        )}
        <FieldDescription>Recorded to the audit trail together with this change.</FieldDescription>
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting}>
          Save
        </Button>
      </div>
    </div>
  );
}
