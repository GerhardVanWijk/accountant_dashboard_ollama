import { useState } from 'react';
import type { ReportingFramework } from '@/types';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';

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
 * The ONLY UI entry point to CompanyService.setReportingFramework() — per
 * SA_ACCOUNTING_MASTER_SPEC.md §3 ("the user must be able to override the
 * automatically determined framework only through an authorized accounting/
 * admin workflow, with the reason recorded" — and per §3/§110, the Public
 * Interest Score engine's own suggestion is exactly that kind of automatic
 * determination, never applied silently). Pre-fills the score's suggestion,
 * but the accountant/admin may pick any framework and must always state why.
 */
export function ReportingFrameworkOverrideForm({
  currentFramework,
  suggestedFramework,
  onSubmit,
  onCancel,
}: ReportingFrameworkOverrideFormProps) {
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
    <div className="flex flex-col gap-md">
      <p className="text-sm text-text-secondary">
        Currently: <span className="font-medium text-text-primary">{FRAMEWORK_LABELS[currentFramework]}</span>. This
        change is recorded to the audit trail together with your reason — nothing sets the reporting framework
        automatically.
      </p>
      <div>
        <label className={fieldLabel} htmlFor="frameworkSelect">
          New reporting framework
        </label>
        <select
          id="frameworkSelect"
          className={fieldInput}
          value={framework}
          onChange={(e) => setFramework(e.target.value as ReportingFramework)}
        >
          {(Object.keys(FRAMEWORK_LABELS) as ReportingFramework[]).map((value) => (
            <option key={value} value={value}>
              {FRAMEWORK_LABELS[value]}
              {value === suggestedFramework ? ' (suggested)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="frameworkReason">
          Reason (required)
        </label>
        <textarea
          id="frameworkReason"
          className={fieldInput}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Confirmed Public Interest Score calculation and compilation method with the company's accountant."
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
