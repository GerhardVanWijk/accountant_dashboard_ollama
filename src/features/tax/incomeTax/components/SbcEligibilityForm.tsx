import { useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect } from '@/components/app/combobox';

export interface SbcEligibilityFormProps {
  currentValue: boolean;
  onSubmit: (isEligible: boolean, reason: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Sets Company.isSbcEligible via CompanyService.setSbcEligibility() — a
 * manual, reason-required override, mirroring setReportingFramework()'s
 * "no automatic determination" pattern exactly. This form does NOT
 * attempt to determine eligibility itself; it only records that an
 * accountant/admin confirmed it and why. Re-skinned onto v0's
 * Field/Textarea (M7); the audited-service call site and required-reason
 * validation are unchanged.
 */
export function SbcEligibilityForm({ currentValue, onSubmit, onCancel, onDirtyChange }: SbcEligibilityFormProps) {
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
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <p className="text-sm text-muted-foreground">
        SBC (Small Business Corporation) eligibility legislatively depends on shareholder composition, whether this is a personal service company, and restrictions on holding shares in
        other companies — none of which this app models. Confirm eligibility yourself before setting this flag; it is never auto-determined.
      </p>
      <Field>
        <FieldLabel htmlFor="sbcEligible">Is SBC-eligible?</FieldLabel>
        <EnumSelect
          id="sbcEligible"
          value={isEligible ? 'yes' : 'no'}
          onValueChange={(value) => setIsEligible(value === 'yes')}
          options={[
            { value: 'no', label: 'No — standard corporate rate applies' },
            { value: 'yes', label: 'Yes — SBC brackets apply' },
          ]}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="sbcReason">Reason (required)</FieldLabel>
        <Textarea
          id="sbcReason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Confirmed shareholder register: all natural persons, no other company holdings, gross income below threshold."
        />
        {validationError && (
          <p role="alert" className="text-sm text-destructive">
            {validationError}
          </p>
        )}
        <FieldDescription>Recorded to the audit trail together with this change.</FieldDescription>
      </Field>
      </FormBody>
      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting}>
          Save
        </Button>
      </FormFooter>
    </div>
  );
}
