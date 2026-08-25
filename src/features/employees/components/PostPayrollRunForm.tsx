import { useState } from 'react';
import type { Account } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/shadcn/field';

const selectClassName = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export interface PostPayrollRunFormProps {
  accounts: Account[];
  onSubmit: (contraAccountId: string) => Promise<void>;
  onCancel: () => void;
}

/** Cash and Bank's Chart of Accounts code — matched by `code`, not a fixed id, since account ids are real Supabase-generated uuids, not the old Mock-era `'acc_1000'` literal. */
const DEFAULT_CONTRA_ACCOUNT_CODE = '1000';

/**
 * Picks the account net pay is credited to when the run posts — same
 * "choose a funding/contra account" pattern as AssetRegisterPage's
 * PostAcquisitionForm. Re-skinned onto v0's Field (M13); posting logic
 * unchanged.
 */
export function PostPayrollRunForm({ accounts, onSubmit, onCancel }: PostPayrollRunFormProps) {
  const [contraAccountId, setContraAccountId] = useState(accounts.find((a) => a.code === DEFAULT_CONTRA_ACCOUNT_CODE)?.id ?? (accounts[0]?.id ?? ''));
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
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="contraAccountId">Net Pay Account</FieldLabel>
        <select id="contraAccountId" className={selectClassName} value={contraAccountId} onChange={(e) => setContraAccountId(e.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </select>
        <FieldDescription>
          Pick Cash and Bank if net pay is disbursed immediately, or Net Pay Payable if the EFT batch runs later.
          PAYE/UIF/SDL always post to their own dedicated liability accounts regardless of this choice.
        </FieldDescription>
      </Field>
      <p className="text-sm text-muted-foreground">
        This posts one combined, balanced journal entry for every employee in this run and cannot be undone — review
        the payslip lines before posting.
      </p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || !contraAccountId} onClick={() => void submit()}>
          Post Payroll Run
        </Button>
      </div>
    </div>
  );
}
