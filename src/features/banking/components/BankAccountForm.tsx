import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Account, BankAccount } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { BANK_ACCOUNT_TYPE_LABELS, SA_BANKS } from '../constants';
import { bankAccountFormSchema, toDefaultValues, type BankAccountFormSchema } from '../utils/bankAccountFormSchema';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export interface BankAccountFormProps {
  initialValues?: BankAccount;
  /** Chart of Accounts asset/liability accounts to link this bank account to. */
  glAccounts: Account[];
  onSubmit: (values: BankAccountFormSchema) => Promise<void> | void;
  onCancel: () => void;
  submitting?: boolean;
  submitError?: string | null;
  submitLabel?: string;
}

/**
 * Cash & Bank Account create/edit form — same bankAccountFormSchema.ts and
 * BankAccountService wiring as before the port, JSX re-skinned onto v0's
 * Field/Input primitives. Account type (Current/Savings/Credit Card/Petty
 * Cash/Money Market/Foreign Currency), SA banking metadata, and the
 * required Chart of Accounts GL link are unchanged.
 */
export function BankAccountForm({
  initialValues,
  glAccounts,
  onSubmit,
  onCancel,
  submitting,
  submitError,
  submitLabel = 'Save bank account',
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
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="bank-account-name">Account name</FieldLabel>
          <Input id="bank-account-name" placeholder="e.g. FNB Business Current Account" {...register('name')} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bank-account-type">Account type</FieldLabel>
          <select id="bank-account-type" className={selectClassName} {...register('accountType')}>
            {Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError errors={[errors.accountType]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="bank-account-bank">Bank name</FieldLabel>
          <select id="bank-account-bank" className={selectClassName} {...register('bankName')}>
            {SA_BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
          <FieldError errors={[errors.bankName]} />
        </Field>
        {bankName === 'Other' && (
          <Field>
            <FieldLabel htmlFor="bank-account-bank-other">Other bank name</FieldLabel>
            <Input id="bank-account-bank-other" {...register('bankNameOther')} />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="bank-account-number">Account number</FieldLabel>
          <Input id="bank-account-number" className="figure" {...register('accountNumber')} />
          <FieldError errors={[errors.accountNumber]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bank-account-branch">Branch code</FieldLabel>
          <Input id="bank-account-branch" className="figure" placeholder="e.g. 250655" {...register('branchCode')} />
        </Field>

        {accountType === 'foreign_currency' && (
          <Field>
            <FieldLabel htmlFor="bank-account-swift">Swift / BIC code</FieldLabel>
            <Input id="bank-account-swift" className="figure" placeholder="e.g. FIRNZAJJ" {...register('swiftCode')} />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="bank-account-currency">Currency</FieldLabel>
          <Input id="bank-account-currency" className="figure uppercase" maxLength={3} {...register('currency')} />
          <FieldError errors={[errors.currency]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="bank-account-opening-balance">Opening balance</FieldLabel>
          <Input id="bank-account-opening-balance" type="number" step="0.01" {...register('openingBalance')} />
          <FieldError errors={[errors.openingBalance]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bank-account-status">Status</FieldLabel>
          <select id="bank-account-status" className={selectClassName} {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="bank-account-gl">Linked GL account (Chart of Accounts)</FieldLabel>
          <select id="bank-account-gl" className={selectClassName} {...register('glAccountId')}>
            <option value="">Select a GL account…</option>
            {glAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <FieldError errors={[errors.glAccountId]} />
        </Field>
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || submitting}>
          {isSubmitting || submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
