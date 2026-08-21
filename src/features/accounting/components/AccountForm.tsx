import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Account } from '@/types';
import { Button } from '@/components/ui/Button';
import { ACCOUNT_TYPES } from '../types/account.types';
import {
  accountFormSchema,
  DEFAULT_NORMAL_BALANCE,
  toDefaultValues,
  type AccountFormSchema,
} from '../utils/accountFormSchema';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface AccountFormProps {
  initialValues?: Account;
  /** Every other account in the chart, used to populate the Parent Account picker. */
  accounts: Account[];
  /** True if this account (edit mode only) already has posted ledger lines
   * — informational only, per docs/LEDGER_ARCHITECTURE.md an account with
   * postings is never hard-deleted, but nothing here blocks editing it. */
  hasPostings?: boolean;
  onSubmit: (values: AccountFormSchema) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

/**
 * Chart of Accounts create/edit form. `type` drives a suggested
 * `normalBalance` default (debit for assets/expenses, credit for
 * liabilities/equity/revenue) but the field stays editable since a
 * contra account can legitimately run the other way.
 */
export function AccountForm({
  initialValues,
  accounts,
  hasPostings = false,
  onSubmit,
  onCancel,
  submitLabel = 'Save Account',
}: AccountFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormSchema>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: toDefaultValues(initialValues),
  });

  const selectedType = watch('type');
  const parentOptions = accounts.filter((a) => a.type === selectedType && a.id !== initialValues?.id);

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      className="flex flex-col gap-lg"
    >
      {hasPostings && (
        <p className="rounded-md border border-border bg-background px-sm py-xs text-xs text-text-secondary">
          This account has posted ledger history — it can be renamed or deactivated, but it cannot be deleted from
          the chart.
        </p>
      )}

      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <Field label="Account Code" error={errors.code?.message}>
          <input className={`${inputClass} font-mono`} {...register('code')} />
        </Field>
        <Field label="Account Name" error={errors.name?.message}>
          <input className={inputClass} {...register('name')} />
        </Field>
        <Field label="Master Type" error={errors.type?.message}>
          <select
            className={inputClass}
            {...register('type', {
              onChange: (e) => {
                const nextType = e.target.value as AccountFormSchema['type'];
                setValue('normalBalance', DEFAULT_NORMAL_BALANCE[nextType]);
                setValue('parentAccountId', '');
              },
            })}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sub-Type (optional)">
          <input className={inputClass} placeholder="e.g. current_asset" {...register('subType')} />
        </Field>
        <Field label="Normal Balance" error={errors.normalBalance?.message}>
          <select className={inputClass} {...register('normalBalance')}>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
        </Field>
        <Field label="Parent Account (optional)">
          <select className={inputClass} {...register('parentAccountId')}>
            <option value="">No parent — top-level account</option>
            {parentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <label className="flex items-center gap-sm text-sm text-text-primary">
            <input type="checkbox" className="h-4 w-4 rounded border-border" {...register('isActive')} />
            Active — can be posted to
          </label>
        </Field>
      </div>

      <Field label="Description (optional)">
        <textarea className={inputClass} rows={2} {...register('description')} />
      </Field>

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-xs text-sm">
      <span className="font-medium text-text-primary">{label}</span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}
