import { useEffect, useState } from 'react';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect, type EnumOption } from '@/components/app/combobox';
import { FormFooter, FormSection, FormTabs, type FormTab } from '@/components/app/form';
import { SUPPLIER_CATEGORIES } from '../types/supplier.types';
import { supplierFormSchema, type SupplierFormSchema } from '../utils/supplierFormSchema';

const CATEGORY_OPTIONS: EnumOption[] = [
  { value: '', label: 'Unassigned' },
  ...SUPPLIER_CATEGORIES.map((category) => ({ value: category, label: category })),
];

const STATUS_OPTIONS: EnumOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const PAYMENT_TERMS_OPTIONS: EnumOption[] = [
  { value: '', label: 'Unassigned' },
  { value: 'Net14', label: 'Net 14' },
  { value: 'Net30', label: 'Net 30' },
  { value: 'EOM', label: 'EOM' },
];

const PAYMENT_METHOD_OPTIONS: EnumOption[] = [
  { value: '', label: 'Unassigned' },
  { value: 'EFT', label: 'EFT' },
  { value: 'Direct Debit', label: 'Direct Debit' },
  { value: 'Credit Card', label: 'Credit Card' },
];

type TabKey = 'general' | 'contacts' | 'addresses' | 'financial';

const TABS: { key: TabKey; label: string; fields: (keyof SupplierFormSchema)[] }[] = [
  { key: 'general', label: 'General Info', fields: ['supplierNumber', 'name', 'category', 'status', 'onHold', 'currency', 'balance'] },
  { key: 'contacts', label: 'Primary Contacts', fields: ['email', 'phone', 'contactPerson'] },
  { key: 'addresses', label: 'Addresses', fields: ['address', 'remittanceAddress'] },
  {
    key: 'financial',
    label: 'Financial & Tax',
    fields: ['taxNumber', 'creditLimit', 'paymentTerms', 'paymentMethod', 'settlementDiscountPercent', 'bankDetails', 'notes'],
  },
];

function toDefaultValues(supplier?: Supplier): SupplierFormSchema {
  return {
    supplierNumber: supplier?.supplierNumber ?? '',
    name: supplier?.name ?? '',
    category: supplier?.category,
    status: supplier?.status ?? 'active',
    onHold: supplier?.onHold ?? false,
    currency: supplier?.currency ?? 'ZAR',
    balance: supplier?.balance ?? 0,
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    contactPerson: supplier?.contactPerson ?? '',
    address: {
      line1: supplier?.address?.line1 ?? '',
      line2: supplier?.address?.line2 ?? '',
      city: supplier?.address?.city ?? '',
      state: supplier?.address?.state ?? '',
      postalCode: supplier?.address?.postalCode ?? '',
      country: supplier?.address?.country ?? '',
    },
    remittanceAddress: {
      line1: supplier?.remittanceAddress?.line1 ?? '',
      line2: supplier?.remittanceAddress?.line2 ?? '',
      city: supplier?.remittanceAddress?.city ?? '',
      state: supplier?.remittanceAddress?.state ?? '',
      postalCode: supplier?.remittanceAddress?.postalCode ?? '',
      country: supplier?.remittanceAddress?.country ?? '',
    },
    taxNumber: supplier?.taxNumber ?? '',
    creditLimit: supplier?.creditLimit,
    paymentTerms: supplier?.paymentTerms,
    paymentMethod: supplier?.paymentMethod,
    settlementDiscountPercent: supplier?.settlementDiscountPercent,
    bankDetails: {
      bankName: supplier?.bankDetails?.bankName ?? '',
      branchCode: supplier?.bankDetails?.branchCode ?? '',
      accountNumber: supplier?.bankDetails?.accountNumber ?? '',
    },
    notes: supplier?.notes ?? '',
  };
}

export interface SupplierFormProps {
  initialValues?: Supplier;
  onSubmit: (values: SupplierFormSchema) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
  submitError?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}

function tabHasError(fields: (keyof SupplierFormSchema)[], errors: FieldErrors<SupplierFormSchema>): boolean {
  return fields.some((field) => Boolean(errors[field]));
}

/**
 * Multi-tab supplier onboarding/edit form (General Info / Primary Contacts /
 * Addresses / Financial & Tax), backed by react-hook-form + zod — the exact
 * same supplierFormSchema.ts, validation and mutation wiring as before,
 * unchanged. P3D: the tab region is the shared `FormTabs` (stable size,
 * brand active tab, per-tab error dot, keepMounted) inside a bounded
 * `h-[28rem]` frame — Supplier create/edit stays a full-page workflow
 * (SuppliersRoot), not a modal, so the frame is bounded here rather than by
 * a `FormShell`.
 */
export function SupplierForm({ initialValues, onSubmit, onCancel, submitLabel = 'Save Supplier', submitError, onDirtyChange }: SupplierFormProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SupplierFormSchema>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: toDefaultValues(initialValues),
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const tabs: FormTab[] = [
    {
      value: 'general',
      label: TABS[0].label,
      hasError: tabHasError(TABS[0].fields, errors),
      content: (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="supplier-number">Supplier number</FieldLabel>
            <Input id="supplier-number" {...register('supplierNumber')} />
            <FieldError errors={[errors.supplierNumber]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-name">Supplier name</FieldLabel>
            <Input id="supplier-name" {...register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-category">Category</FieldLabel>
            <Controller
              control={control}
              name="category"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="supplier-category"
                  name="category"
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v === '' ? undefined : v)}
                  invalid={Boolean(fieldState.error)}
                  options={CATEGORY_OPTIONS}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-currency">Currency</FieldLabel>
            <Input id="supplier-currency" {...register('currency')} />
            <FieldError errors={[errors.currency]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-status">Status</FieldLabel>
            <Controller
              control={control}
              name="status"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="supplier-status"
                  name="status"
                  value={field.value ?? 'active'}
                  onValueChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  options={STATUS_OPTIONS}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-balance">Opening balance</FieldLabel>
            <Input id="supplier-balance" type="number" step="0.01" {...register('balance', { valueAsNumber: true })} />
            <FieldError errors={[errors.balance]} />
          </Field>
          <Field orientation="horizontal">
            <input type="checkbox" id="supplier-on-hold" className="size-4 rounded border-input" {...register('onHold')} />
            <FieldLabel htmlFor="supplier-on-hold" className="font-normal">
              Place this supplier on hold
            </FieldLabel>
          </Field>
        </div>
      ),
    },
    {
      value: 'contacts',
      label: TABS[1].label,
      hasError: tabHasError(TABS[1].fields, errors),
      content: (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="supplier-contact-person">Contact person</FieldLabel>
            <Input id="supplier-contact-person" {...register('contactPerson')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-email">Email</FieldLabel>
            <Input id="supplier-email" type="email" {...register('email')} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-phone">Phone</FieldLabel>
            <Input id="supplier-phone" {...register('phone')} />
          </Field>
        </div>
      ),
    },
    {
      value: 'addresses',
      label: TABS[2].label,
      hasError: tabHasError(TABS[2].fields, errors),
      content: (
        <>
          <FormSection title="Physical address">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="supplier-address-line1">Address line 1</FieldLabel>
                <Input id="supplier-address-line1" {...register('address.line1')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-address-line2">Address line 2</FieldLabel>
                <Input id="supplier-address-line2" {...register('address.line2')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-address-city">City</FieldLabel>
                <Input id="supplier-address-city" {...register('address.city')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-address-state">Province/State</FieldLabel>
                <Input id="supplier-address-state" {...register('address.state')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-address-postal">Postal code</FieldLabel>
                <Input id="supplier-address-postal" {...register('address.postalCode')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-address-country">Country</FieldLabel>
                <Input id="supplier-address-country" {...register('address.country')} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Remittance address (if different)">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="supplier-remit-line1">Address line 1</FieldLabel>
                <Input id="supplier-remit-line1" {...register('remittanceAddress.line1')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-remit-line2">Address line 2</FieldLabel>
                <Input id="supplier-remit-line2" {...register('remittanceAddress.line2')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-remit-city">City</FieldLabel>
                <Input id="supplier-remit-city" {...register('remittanceAddress.city')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-remit-state">Province/State</FieldLabel>
                <Input id="supplier-remit-state" {...register('remittanceAddress.state')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-remit-postal">Postal code</FieldLabel>
                <Input id="supplier-remit-postal" {...register('remittanceAddress.postalCode')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-remit-country">Country</FieldLabel>
                <Input id="supplier-remit-country" {...register('remittanceAddress.country')} />
              </Field>
            </div>
          </FormSection>
        </>
      ),
    },
    {
      value: 'financial',
      label: TABS[3].label,
      hasError: tabHasError(TABS[3].fields, errors),
      content: (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supplier-tax-number">Tax/VAT registration number</FieldLabel>
              <Input id="supplier-tax-number" {...register('taxNumber')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-credit-limit">Credit limit</FieldLabel>
              <Input
                id="supplier-credit-limit"
                type="number"
                step="0.01"
                {...register('creditLimit', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              />
              <FieldError errors={[errors.creditLimit]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-payment-terms">Payment terms</FieldLabel>
              <Controller
                control={control}
                name="paymentTerms"
                render={({ field, fieldState }) => (
                  <EnumSelect
                    id="supplier-payment-terms"
                    name="paymentTerms"
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === '' ? undefined : v)}
                    invalid={Boolean(fieldState.error)}
                    options={PAYMENT_TERMS_OPTIONS}
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-payment-method">Payment method</FieldLabel>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field, fieldState }) => (
                  <EnumSelect
                    id="supplier-payment-method"
                    name="paymentMethod"
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === '' ? undefined : v)}
                    invalid={Boolean(fieldState.error)}
                    options={PAYMENT_METHOD_OPTIONS}
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-settlement-discount">Settlement discount (%)</FieldLabel>
              <Input
                id="supplier-settlement-discount"
                type="number"
                step="0.1"
                {...register('settlementDiscountPercent', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              />
              <FieldError errors={[errors.settlementDiscountPercent]} />
            </Field>
          </div>

          <FormSection title="Banking details">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="supplier-bank-name">Bank name</FieldLabel>
                <Input id="supplier-bank-name" {...register('bankDetails.bankName')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-bank-branch">Branch code</FieldLabel>
                <Input id="supplier-bank-branch" {...register('bankDetails.branchCode')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-bank-account">Account number</FieldLabel>
                <Input id="supplier-bank-account" {...register('bankDetails.accountNumber')} />
              </Field>
            </div>
          </FormSection>

          <Field>
            <FieldLabel htmlFor="supplier-notes">Notes</FieldLabel>
            <Textarea id="supplier-notes" rows={3} {...register('notes')} />
          </Field>
        </>
      ),
    },
  ];

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      className="flex flex-col"
    >
      <div className="flex h-[28rem] flex-col">
        <FormTabs tabs={tabs} value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} />
      </div>

      <FormFooter error={submitError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </FormFooter>
    </form>
  );
}
