import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { SUPPLIER_CATEGORIES } from '../types/supplier.types';
import { supplierFormSchema, type SupplierFormSchema } from '../utils/supplierFormSchema';

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
}

function tabHasError(fields: (keyof SupplierFormSchema)[], errors: FieldErrors<SupplierFormSchema>): boolean {
  return fields.some((field) => Boolean(errors[field]));
}

/**
 * Multi-tab supplier onboarding/edit form (General Info / Primary
 * Contacts / Addresses / Financial & Tax), backed by react-hook-form +
 * zod — the exact same supplierFormSchema.ts every other SupplierForm
 * implementation used, unchanged. Only the JSX is re-skinned onto v0's
 * Field/Input/Select/Tabs primitives.
 */
export function SupplierForm({ initialValues, onSubmit, onCancel, submitLabel = 'Save Supplier' }: SupplierFormProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormSchema>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: toDefaultValues(initialValues),
  });

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      className="flex flex-col gap-4"
    >
      {/*
        Stable tab region (docs/CURRENT_TASKS.md #3). This form renders on a
        page (SupplierFormPage), not in a fixed-height dialog, so a min-height
        floor + internal scroll keeps the shortest tab (Contacts) from
        collapsing the page and jumping the layout on tab switches.
      */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabKey)}
        className="flex h-[28rem] flex-col"
      >
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
              {tab.label}
              {tabHasError(tab.fields, errors) && (
                <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className="app-scroll min-h-0 flex-1 overflow-y-auto pt-4">
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
              <NativeSelect
                id="supplier-category"
                {...register('category', { setValueAs: (v) => (v === '' ? undefined : v) })}
              >
                <option value="">Unassigned</option>
                {SUPPLIER_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-currency">Currency</FieldLabel>
              <Input id="supplier-currency" {...register('currency')} />
              <FieldError errors={[errors.currency]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-status">Status</FieldLabel>
              <NativeSelect id="supplier-status" {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </NativeSelect>
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
        </TabsContent>

        <TabsContent value="contacts" className="app-scroll min-h-0 flex-1 overflow-y-auto pt-4">
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
        </TabsContent>

        <TabsContent value="addresses" className="app-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pt-4">
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold">Physical address</legend>
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
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold">Remittance address (if different)</legend>
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
          </fieldset>
        </TabsContent>

        <TabsContent value="financial" className="app-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pt-4">
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
              <NativeSelect
                id="supplier-payment-terms"
                {...register('paymentTerms', { setValueAs: (v) => (v === '' ? undefined : v) })}
              >
                <option value="">Unassigned</option>
                <option value="Net14">Net 14</option>
                <option value="Net30">Net 30</option>
                <option value="EOM">EOM</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-payment-method">Payment method</FieldLabel>
              <NativeSelect
                id="supplier-payment-method"
                {...register('paymentMethod', { setValueAs: (v) => (v === '' ? undefined : v) })}
              >
                <option value="">Unassigned</option>
                <option value="EFT">EFT</option>
                <option value="Direct Debit">Direct Debit</option>
                <option value="Credit Card">Credit Card</option>
              </NativeSelect>
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

          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold">Banking details</legend>
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
          </fieldset>

          <Field>
            <FieldLabel htmlFor="supplier-notes">Notes</FieldLabel>
            <Textarea id="supplier-notes" rows={3} {...register('notes')} />
          </Field>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
