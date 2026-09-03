import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Account, BankAccount } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, SearchableSelect } from '@/components/app/combobox';
import { FormBody, FormFooter } from '@/components/app/form';
import { BANK_ACCOUNT_TYPE_LABELS, SA_BANKS } from '../constants';

const BANK_ACCOUNT_TYPE_OPTIONS = Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const SA_BANK_OPTIONS = SA_BANKS.map((bank) => ({ value: bank, label: bank }));
const BANK_ACCOUNT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
import { bankAccountFormSchema, toDefaultValues, type BankAccountFormSchema } from '../utils/bankAccountFormSchema';

export interface BankAccountFormProps {
  initialValues?: BankAccount;
  /** Chart of Accounts asset/liability accounts to link this bank account to. */
  glAccounts: Account[];
  onSubmit: (values: BankAccountFormSchema) => Promise<void> | void;
  onCancel: () => void;
  submitting?: boolean;
  submitError?: string | null;
  submitLabel?: string;
  /** Reports edit state up to the hosting `FormShell` for the unsaved-changes guard. */
  onDirtyChange?: (dirty: boolean) => void;
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
  onDirtyChange,
}: BankAccountFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BankAccountFormSchema>({
    resolver: zodResolver(bankAccountFormSchema),
    defaultValues: toDefaultValues(initialValues),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

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
      className="flex min-h-0 flex-1 flex-col"
    >
      <FormBody>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="bank-account-name">Account name</FieldLabel>
          <Input id="bank-account-name" placeholder="e.g. FNB Business Current Account" {...register('name')} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bank-account-type">Account type</FieldLabel>
          <Controller
            control={control}
            name="accountType"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="bank-account-type"
                name="accountType"
                value={field.value ?? BANK_ACCOUNT_TYPE_OPTIONS[0]?.value ?? ''}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={BANK_ACCOUNT_TYPE_OPTIONS}
              />
            )}
          />
          <FieldError errors={[errors.accountType]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="bank-account-bank">Bank name</FieldLabel>
          <Controller
            control={control}
            name="bankName"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="bank-account-bank"
                name="bankName"
                value={field.value ?? SA_BANK_OPTIONS[0]?.value ?? ''}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={SA_BANK_OPTIONS}
              />
            )}
          />
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
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <EnumSelect
                id="bank-account-status"
                name="status"
                value={field.value ?? 'active'}
                onValueChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                options={BANK_ACCOUNT_STATUS_OPTIONS}
              />
            )}
          />
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="bank-account-gl">Linked GL account (Chart of Accounts)</FieldLabel>
          <Controller
            control={control}
            name="glAccountId"
            render={({ field, fieldState }) => (
              <SearchableSelect
                id="bank-account-gl"
                name="glAccountId"
                value={field.value || null}
                onChange={(value) => field.onChange(value ?? '')}
                invalid={Boolean(fieldState.error)}
                placeholder="Select a GL account…"
                options={glAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.code} — ${a.name}`,
                  keywords: a.code,
                }))}
              />
            )}
          />
          <FieldError errors={[errors.glAccountId]} />
        </Field>
      </div>
      </FormBody>

      <FormFooter error={submitError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting || submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || submitting}>
          {isSubmitting || submitting ? 'Saving…' : submitLabel}
        </Button>
      </FormFooter>
    </form>
  );
}
