import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Account, BankAccount } from '@/types';
import { Button } from '@/components/ui/Button';
import { BANK_ACCOUNT_TYPE_LABELS, SA_BANKS } from '../constants';
import { bankAccountFormSchema, toDefaultValues, type BankAccountFormSchema } from '../utils/bankAccountFormSchema';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface BankAccountFormProps {
  initialValues?: BankAccount;
  /** Chart of Accounts asset/liability accounts to link this bank account to. */
  glAccounts: Account[];
  onSubmit: (values: BankAccountFormSchema) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

/**
 * Cash & Bank Account create/edit form: account type (Current/Savings/
 * Credit Card/Petty Cash/Money Market/Foreign Currency), SA banking
 * metadata (Bank Name, Branch Code, Account Number, Swift Code), and the
 * required Chart of Accounts GL link.
 */
export function BankAccountForm({
  initialValues,
  glAccounts,
  onSubmit,
  onCancel,
  submitLabel = 'Save Bank Account',
}: BankAccountFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BankAccountFormSchema>({
    resolver: zodResolver(bankAccountFormSchema),
    defaultValues: toDefaultValues(initialValues),
  });

  const bankName = watch('bankName');
  const accountType = watch('accountType');

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit({
          ...values,
          bankName: values.bankName === 'Other' ? values.bankNameOther?.trim() || 'Other' : values.bankName,
        });
      })}
      className="flex flex-col gap-lg"
    >
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">
        <Field label="Account Name" error={errors.name?.message}>
          <input className={inputClass} placeholder="e.g. FNB Business Current Account" {...register('name')} />
        </Field>
        <Field label="Account Type" error={errors.accountType?.message}>
          <select className={inputClass} {...register('accountType')}>
            {Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Bank Name" error={errors.bankName?.message}>
          <select className={inputClass} {...register('bankName')}>
            {SA_BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
        </Field>
        {bankName === 'Other' && (
          <Field label="Other Bank Name">
            <input className={inputClass} {...register('bankNameOther')} />
          </Field>
        )}

        <Field label="Account Number" error={errors.accountNumber?.message}>
          <input className={`${inputClass} font-mono`} {...register('accountNumber')} />
        </Field>
        <Field label="Branch Code">
          <input className={`${inputClass} font-mono`} placeholder="e.g. 250655" {...register('branchCode')} />
        </Field>

        {accountType === 'foreign_currency' && (
          <Field label="Swift / BIC Code">
            <input className={`${inputClass} font-mono`} placeholder="e.g. FIRNZAJJ" {...register('swiftCode')} />
          </Field>
        )}
        <Field label="Currency" error={errors.currency?.message}>
          <input className={`${inputClass} font-mono uppercase`} maxLength={3} {...register('currency')} />
        </Field>

        <Field label="Opening Balance" error={errors.openingBalance?.message}>
          <input type="number" step="0.01" className={inputClass} {...register('openingBalance')} />
        </Field>
        <Field label="Status">
          <select className={inputClass} {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>

        <Field label="Linked GL Account (Chart of Accounts)" error={errors.glAccountId?.message}>
          <select className={inputClass} {...register('glAccountId')}>
            <option value="">Select a GL account…</option>
            {glAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

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
