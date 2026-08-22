import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface SbcEligibilityFormProps {
  currentValue: boolean;
  onSubmit: (isEligible: boolean, reason: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Sets Company.isSbcEligible via CompanyService.setSbcEligibility() — a
 * manual, reason-required override (§53), mirroring
 * setReportingFramework()'s "no automatic determination" pattern exactly.
 * This form does NOT attempt to determine eligibility itself; it only
 * records that an accountant/admin confirmed it and why.
 */
export function SbcEligibilityForm({ currentValue, onSubmit, onCancel }: SbcEligibilityFormProps) {
  const [isEligible, setIsEligible] = useState(currentValue);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) {
      setValidationError('A reason is required to change SBC eligibility.');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await onSubmit(isEligible, reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-secondary">
        SBC (Small Business Corporation) eligibility legislatively depends on shareholder composition, whether this
        is a personal service company, and restrictions on holding shares in other companies (§53) — none of which
        this app models. Confirm eligibility yourself before setting this flag; it is never auto-determined.
      </p>
      <div>
        <label className={fieldLabel} htmlFor="sbcEligible">
          Is SBC-eligible?
        </label>
        <select
          id="sbcEligible"
          className={fieldInput}
          value={isEligible ? 'yes' : 'no'}
          onChange={(e) => setIsEligible(e.target.value === 'yes')}
        >
          <option value="no">No — standard corporate rate applies</option>
          <option value="yes">Yes — SBC brackets apply</option>
        </select>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="sbcReason">
          Reason (required)
        </label>
        <textarea
          id="sbcReason"
          className={fieldInput}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Confirmed shareholder register: all natural persons, no other company holdings, gross income below threshold."
        />
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
