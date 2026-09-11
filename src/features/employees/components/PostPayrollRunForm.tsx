import { useState } from 'react';
import type { Account } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { FormBody, FormFooter } from '@/components/app/form';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';
import { SearchableSelect } from '@/components/app/combobox';

export interface PostPayrollRunFormProps {
  accounts: Account[];
  onSubmit: (contraAccountId: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Net Pay Payable's Chart of Accounts code — matched by `code`, not a fixed id, since account ids are real Supabase-generated uuids. */
const DEFAULT_CONTRA_ACCOUNT_CODE = '2250';

/**
 * Picks the clearing/payable account net pay is credited to when the run
 * posts — same "choose a funding/contra account" pattern as
 * AssetRegisterPage's PostAcquisitionForm, narrowed to liability accounts
 * only (Leases + Payroll integrity audit, PART 3 Banking fix). Cash and
 * Bank is deliberately NOT offered here any more: `post_payroll_run`
 * (migration 0091) rejects a non-liability contra account outright — net
 * pay must clear through Net Pay Payable (2250) so the real EFT
 * disbursement, recorded once through Banking against that same account,
 * can never double-count this run's cash movement.
 */
export function PostPayrollRunForm({ accounts, onSubmit, onCancel, onDirtyChange }: PostPayrollRunFormProps) {
  const liabilityAccounts = accounts.filter((a) => a.type === 'liability');
  const [contraAccountId, setContraAccountId] = useState(
    liabilityAccounts.find((a) => a.code === DEFAULT_CONTRA_ACCOUNT_CODE)?.id ?? (liabilityAccounts[0]?.id ?? ''),
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(contraAccountId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onInput={() => onDirtyChange?.(true)}>
      <FormBody>
      <Field>
        <FieldLabel htmlFor="contraAccountId">Net Pay Clearing Account</FieldLabel>
        <SearchableSelect
          id="contraAccountId"
          value={contraAccountId || null}
          onChange={(value) => setContraAccountId(value ?? '')}
          options={liabilityAccounts.map((account) => ({
            value: account.id,
            label: `${account.code} - ${account.name}`,
            keywords: account.code,
          }))}
        />
        <FieldDescription>
          Net pay is credited to this clearing account, never to Cash and Bank directly. Once the real EFT batch
          actually clears the bank, record it once in Banking (Direct Payment or an allocated statement line) against
          this same account — that is what actually moves cash and keeps the books reconciled. PAYE/UIF/SDL always
          post to their own dedicated liability accounts regardless of this choice.
        </FieldDescription>
      </Field>
      <p className="text-sm text-muted-foreground">
        This posts one combined, balanced journal entry for every employee in this run. It cannot be undone by
        editing — review the payslip lines before posting; a posted run can only be corrected with a reason-tracked
        reversal afterward.
      </p>
      </FormBody>

      <FormFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !contraAccountId} onClick={() => void submit()}>
          Post Payroll Run
        </Button>
      </FormFooter>
    </div>
  );
}
