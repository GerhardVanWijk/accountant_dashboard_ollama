import { useState } from 'react';
import type { ReportingFramework } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Textarea } from '@/components/ui/shadcn/textarea';

const selectClassName = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const FRAMEWORK_LABELS: Record<ReportingFramework, string> = {
  full_ifrs: 'Full IFRS',
  ifrs_for_smes: 'IFRS for SMEs',
  other_sa_framework: 'Other applicable SA framework',
  grap: 'GRAP',
  not_yet_determined: 'Not yet determined',
};

export interface ReportingFrameworkOverrideFormProps {
  currentFramework: ReportingFramework;
  suggestedFramework: ReportingFramework;
  onSubmit: (framework: ReportingFramework, reason: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * The ONLY UI entry point to CompanyService.setReportingFramework() — the
 * automatically-suggested framework from the Public Interest Score engine
 * is never applied silently; an accountant/admin must pick a framework and
 * state why. Re-skinned onto v0's Field/Textarea (M7); the audited-service
 * call site and required-reason validation are unchanged.
 */
export function ReportingFrameworkOverrideForm({ currentFramework, suggestedFramework, onSubmit, onCancel }: ReportingFrameworkOverrideFormProps) {
  const [framework, setFramework] = useState<ReportingFramework>(suggestedFramework);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) {
      setValidationError('A reason is required to change the reporting framework.');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await onSubmit(framework, reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Currently: <span className="font-medium text-foreground">{FRAMEWORK_LABELS[currentFramework]}</span>. This change is recorded to the audit trail together with your reason —
        nothing sets the reporting framework automatically.
      </p>
      <Field>
        <FieldLabel htmlFor="frameworkSelect">New reporting framework</FieldLabel>
        <select id="frameworkSelect" className={selectClassName} value={framework} onChange={(e) => setFramework(e.target.value as ReportingFramework)}>
          {(Object.keys(FRAMEWORK_LABELS) as ReportingFramework[]).map((value) => (
            <option key={value} value={value}>
              {FRAMEWORK_LABELS[value]}
              {value === suggestedFramework ? ' (suggested)' : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor="frameworkReason">Reason (required)</FieldLabel>
        <Textarea id="frameworkReason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Confirmed Public Interest Score calculation and compilation method with the company's accountant." />
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
