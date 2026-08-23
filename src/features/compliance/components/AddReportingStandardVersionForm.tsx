import { useState } from 'react';
import type { ReportingStandardName } from '@/types';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface AddReportingStandardVersionFormProps {
  standard: ReportingStandardName;
  onSubmit: (input: {
    standard: ReportingStandardName;
    versionLabel: string;
    effectiveFrom: string;
    earlyAdoptionPermitted: boolean;
    sourceReference: string;
    notes?: string;
  }, reason: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Adds a new edition of a reporting standard (§48/§49) — never edits an
 * existing version's own fields, only marks the prior newest version as
 * superseded (see `ReportingStandardService.supersede()`). A reason is
 * required, same "authorized override" discipline as
 * `ReportingFrameworkOverrideForm`/`SbcEligibilityForm` elsewhere in this
 * codebase.
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
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-secondary">
        This does not remove or edit any prior edition of {standard === 'full_ifrs' ? 'Full IFRS' : 'IFRS for SMEs'} — it only records a new
        one and marks the previous one superseded, so any past reporting period still resolves against whichever edition was actually in
        effect at the time.
      </p>
      <div>
        <label className={fieldLabel} htmlFor="rsvLabel">
          Version label
        </label>
        <input id="rsvLabel" className={fieldInput} value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g. IFRS for SMEs (2030 edition)" />
      </div>
      <div>
        <label className={fieldLabel} htmlFor="rsvEffectiveFrom">
          Effective from (periods beginning on/after)
        </label>
        <input id="rsvEffectiveFrom" type="date" className={fieldInput} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
      </div>
      <label className="flex items-center gap-sm text-sm text-text-primary">
        <input type="checkbox" checked={earlyAdoptionPermitted} onChange={(e) => setEarlyAdoptionPermitted(e.target.checked)} />
        Early adoption permitted
      </label>
      <div>
        <label className={fieldLabel} htmlFor="rsvSource">
          Source reference
        </label>
        <input id="rsvSource" className={fieldInput} value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} placeholder="e.g. IASB announcement / official standard text URL" />
      </div>
      <div>
        <label className={fieldLabel} htmlFor="rsvReason">
          Reason (required)
        </label>
        <textarea id="rsvReason" className={fieldInput} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {validationError && <p className={fieldError}>{validationError}</p>}
        <p className={fieldHint}>Recorded to the audit trail together with this change.</p>
      </div>
      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting}>
          Save
        </Button>
      </div>
    </div>
  );
}
