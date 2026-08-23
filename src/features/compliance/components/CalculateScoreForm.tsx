import { useState } from 'react';
import type { FinancialYear } from '@/types';
import { Button } from '@/components/ui/Button';
import { fieldError, fieldHint, fieldInput, fieldLabel } from './formStyles';
import type { CalculateScoreFormInput } from '../hooks/usePublicInterestScore';

export interface CalculateScoreFormProps {
  financialYears: FinancialYear[];
  onSubmit: (input: CalculateScoreFormInput) => Promise<void>;
  onCancel: () => void;
}

/**
 * Runs a new Public Interest Score calculation (Companies Regulations 2011
 * reg 26(2)). Employees/turnover/third-party-liabilities are computed
 * automatically from real posted data — only the number of shareholders/
 * members (no shareholder register exists anywhere in this codebase) and
 * whether the company holds fiduciary assets exceeding R5 million are asked
 * for here, since nothing else in this app knows either figure.
 */
export function CalculateScoreForm({ financialYears, onSubmit, onCancel }: CalculateScoreFormProps) {
  const [financialYearId, setFinancialYearId] = useState(financialYears[0]?.id ?? '');
  const [shareholdersOrMembersCount, setShareholdersOrMembersCount] = useState('1');
  const [holdsFiduciaryAssetsOverThreshold, setHoldsFiduciaryAssetsOverThreshold] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async () => {
    if (!financialYearId) {
      setValidationError('Select a financial year.');
      return;
    }
    const count = Number(shareholdersOrMembersCount);
    if (!Number.isFinite(count) || count < 0) {
      setValidationError('Number of shareholders/members must be a non-negative number.');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await onSubmit({ financialYearId, shareholdersOrMembersCount: count, holdsFiduciaryAssetsOverThreshold });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-md">
      <div>
        <label className={fieldLabel} htmlFor="pisFinancialYear">
          Financial Year
        </label>
        <select
          id="pisFinancialYear"
          className={fieldInput}
          value={financialYearId}
          onChange={(e) => setFinancialYearId(e.target.value)}
        >
          {financialYears.length === 0 && <option value="">No financial years configured</option>}
          {financialYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.name} ({fy.startDate.slice(0, 10)} – {fy.endDate.slice(0, 10)})
            </option>
          ))}
        </select>
        <p className={fieldHint}>Turnover and third-party liabilities are computed from real posted GL data for this year.</p>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="pisShareholders">
          Number of shareholders / members
        </label>
        <input
          id="pisShareholders"
          type="number"
          min={0}
          step={1}
          className={fieldInput}
          value={shareholdersOrMembersCount}
          onChange={(e) => setShareholdersOrMembersCount(e.target.value)}
        />
        <p className={fieldHint}>
          One point per individual with a beneficial interest in the company&apos;s securities at year end (or per CC
          member) — reg 26(2). No shareholder register exists in this system, so this figure is entered manually.
        </p>
      </div>
      <label className="flex items-center gap-sm text-sm text-text-primary">
        <input
          type="checkbox"
          checked={holdsFiduciaryAssetsOverThreshold}
          onChange={(e) => setHoldsFiduciaryAssetsOverThreshold(e.target.checked)}
        />
        Holds assets exceeding R5 million in a fiduciary capacity
      </label>
      {validationError && <p className={fieldError}>{validationError}</p>}
      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting || financialYears.length === 0}>
          Calculate
        </Button>
      </div>
    </div>
  );
}
