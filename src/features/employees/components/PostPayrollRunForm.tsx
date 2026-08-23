import { useState } from 'react';
import type { Account } from '@/types';
import { Button } from '@/components/ui/Button';
import { fieldHint, fieldInput, fieldLabel } from './formStyles';

export interface PostPayrollRunFormProps {
  accounts: Account[];
  onSubmit: (contraAccountId: string) => Promise<void>;
  onCancel: () => void;
}

/** Cash and Bank's Chart of Accounts code — matched by `code`, not a fixed id, since account ids are real (Supabase-generated) uuids, not the old Mock-era `'acc_1000'` literal. */
const DEFAULT_CONTRA_ACCOUNT_CODE = '1000';

/** Picks the account net pay is credited to when the run posts — mirrors PostAcquisitionForm.tsx's "choose a funding/contra account" pattern. */
export function PostPayrollRunForm({ accounts, onSubmit, onCancel }: PostPayrollRunFormProps) {
  const [contraAccountId, setContraAccountId] = useState(
    accounts.find((a) => a.code === DEFAULT_CONTRA_ACCOUNT_CODE)?.id ?? (accounts[0]?.id ?? ''),
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
    <div className="flex flex-col gap-md">
      <div>
        <label className={fieldLabel} htmlFor="contraAccountId">
          Net Pay Account
        </label>
        <select id="contraAccountId" className={fieldInput} value={contraAccountId} onChange={(e) => setContraAccountId(e.target.value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </select>
        <p className={fieldHint}>
          Pick Cash and Bank if net pay is disbursed immediately, or Net Pay Payable if the EFT batch runs later.
          PAYE/UIF/SDL always post to their own dedicated liability accounts regardless of this choice.
        </p>
      </div>
      <p className={fieldHint}>
        This posts one combined, balanced journal entry for every employee in this run and cannot be undone —
        review the payslip lines before posting.
      </p>
      <div className="flex justify-end gap-sm pt-sm">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting || !contraAccountId}>
          Post Payroll Run
        </Button>
      </div>
    </div>
  );
}
