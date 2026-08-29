import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Account } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { FormBody, FormFooter } from '@/components/app/form';
import { ACCOUNT_TYPES } from '../types/account.types';
import {
  accountFormSchema,
  DEFAULT_NORMAL_BALANCE,
  toDefaultValues,
  type AccountFormSchema,
} from '../utils/accountFormSchema';

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
  submitting?: boolean;
  submitError?: string | null;
  submitLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Chart of Accounts create/edit form — identical accountFormSchema.ts and
 * AccountService wiring as before the port, JSX re-skinned onto v0's
 * Field/Input primitives. `type` drives a suggested `normalBalance`
 * default (debit for assets/expenses, credit for liabilities/equity/
 * revenue) but the field stays editable since a contra account can
 * legitimately run the other way.
 */
export function AccountForm({
  initialValues,
  accounts,
  hasPostings = false,
  onSubmit,
  onCancel,
  submitting,
  submitError,
  submitLabel = 'Save account',
  onDirtyChange,
}: AccountFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<AccountFormSchema>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: toDefaultValues(initialValues),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const selectedType = watch('type');
  const parentOptions = accounts.filter((a) => a.type === selectedType && a.id !== initialValues?.id);

  return (
    <form
      onSubmit={handleSubmit((values) => {
        void onSubmit(values);
      })}
      className="flex min-h-0 flex-1 flex-col"
    >
      <FormBody>
      {hasPostings && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          This account has posted ledger history — it can be renamed or deactivated, but it cannot be deleted from
          the chart.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="account-code">Account code</FieldLabel>
          <Input id="account-code" className="figure" {...register('code')} />
          <FieldError errors={[errors.code]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-name">Account name</FieldLabel>
          <Input id="account-name" {...register('name')} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-type">Master type</FieldLabel>
          <NativeSelect
            id="account-type"
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
          </NativeSelect>
          <FieldError errors={[errors.type]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-subtype">Sub-type (optional)</FieldLabel>
          <Input id="account-subtype" placeholder="e.g. current_asset" {...register('subType')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-normal-balance">Normal balance</FieldLabel>
          <NativeSelect id="account-normal-balance" {...register('normalBalance')}>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </NativeSelect>
          <FieldError errors={[errors.normalBalance]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-parent">Parent account (optional)</FieldLabel>
          <NativeSelect id="account-parent" {...register('parentAccountId')}>
            <option value="">No parent — top-level account</option>
            {parentOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field orientation="horizontal" className="sm:col-span-2">
          <input type="checkbox" id="account-active" className="size-4 rounded border-input" {...register('isActive')} />
          <FieldLabel htmlFor="account-active" className="font-normal">
            Active — can be posted to
          </FieldLabel>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="account-description">Description (optional)</FieldLabel>
        <Textarea id="account-description" rows={2} {...register('description')} />
      </Field>
      </FormBody>

      <FormFooter error={submitError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </FormFooter>
    </form>
  );
}
