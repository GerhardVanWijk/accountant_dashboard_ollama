import { useState } from 'react';
import type { FinancialYear } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import type { CalculateScoreFormInput } from '../hooks/usePublicInterestScore';

export interface CalculateScoreFormProps {
  financialYears: FinancialYear[];
  onSubmit: (input: CalculateScoreFormInput) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Runs a new Public Interest Score calculation (Companies Regulations 2011
 * reg 26(2)). Employees/turnover/third-party-liabilities are computed
 * automatically from real posted data — only the number of shareholders/
 * members (no shareholder register exists anywhere in this codebase) and
 * whether the company holds fiduciary assets exceeding R5 million are
 * asked for here. Re-skinned onto v0's Field/Input/Checkbox (M7);
 * validation logic unchanged.
 */
export function CalculateScoreForm({ financialYears, onSubmit, onCancel, onDirtyChange }: CalculateScoreFormProps) {
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
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <Field>
        <FieldLabel htmlFor="pisFinancialYear">Financial Year</FieldLabel>
        <NativeSelect id="pisFinancialYear" value={financialYearId} onChange={(e) => setFinancialYearId(e.target.value)}>
          {financialYears.length === 0 && <option value="">No financial years configured</option>}
          {financialYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.name} ({fy.startDate.slice(0, 10)} – {fy.endDate.slice(0, 10)})
            </option>
          ))}
        </NativeSelect>
        <FieldDescription>Turnover and third-party liabilities are computed from real posted GL data for this year.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="pisShareholders">Number of shareholders / members</FieldLabel>
        <Input id="pisShareholders" type="number" min={0} step={1} value={shareholdersOrMembersCount} onChange={(e) => setShareholdersOrMembersCount(e.target.value)} />
        <FieldDescription>
          One point per individual with a beneficial interest in the company&apos;s securities at year end (or per CC member) — reg 26(2). No shareholder register exists in this system,
          so this figure is entered manually.
        </FieldDescription>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={holdsFiduciaryAssetsOverThreshold} onCheckedChange={(value) => setHoldsFiduciaryAssetsOverThreshold(value === true)} />
        Holds assets exceeding R5 million in a fiduciary capacity
      </label>
      </FormBody>

      <FormFooter error={validationError ?? undefined}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting || financialYears.length === 0}>
          Calculate
        </Button>
      </FormFooter>
    </div>
  );
}
