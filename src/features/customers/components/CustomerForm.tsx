import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { EnumSelect, type EnumOption } from '@/components/app/combobox';
import { FormFooter, FormSection, FormTabs, type FormTab } from '@/components/app/form';
import { customerFormSchema, type CustomerFormTab, type CustomerFormValues } from '../utils/customerFormSchema';

const STATUS_OPTIONS: EnumOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const TAX_STATUS_OPTIONS: EnumOption[] = [
  { value: 'taxable', label: 'Taxable' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'zero-rated', label: 'Zero-rated' },
];

const CURRENCY_OPTIONS: EnumOption[] = [
  { value: 'ZAR', label: 'ZAR — South African Rand' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'BWP', label: 'BWP — Botswana Pula' },
  { value: 'NAD', label: 'NAD — Namibian Dollar' },
];

const PAYMENT_TERMS_OPTIONS: EnumOption[] = [
  { value: 'COD', label: 'COD' },
  { value: 'Net14', label: 'Net 14' },
  { value: 'Net30', label: 'Net 30' },
  { value: 'Net60', label: 'Net 60' },
];

export interface CustomerFormProps {
  mode: 'create' | 'edit';
  defaultValues: CustomerFormValues;
  onSubmit: (values: CustomerFormValues) => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  submitError?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
}

const tabLabels: Record<CustomerFormTab, string> = {
  general: 'General info',
  contacts: 'Contacts',
  addresses: 'Billing & shipping',
  financial: 'Financial settings',
};

/**
 * Multi-tab create/edit form (General Info / Contacts / Billing &
 * Shipping / Financial Settings), react-hook-form + zod validation — the
 * exact same customerFormSchema.ts every other CustomerForm implementation
 * used, unchanged. P3D: outer structure is now the shared `FormTabs` +
 * `FormFooter` inside a `FormShell` (`CustomerFormModal`) — the tab region
 * no longer resizes the dialog, and the footer is anchored outside the
 * scroll area.
 */
export function CustomerForm({ mode, defaultValues, onSubmit, onCancel, submitting, submitError, onDirtyChange }: CustomerFormProps) {
  const [activeTab, setActiveTab] = useState<CustomerFormTab>('general');

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isDirty },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues,
  });

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({
    control,
    name: 'contacts',
  });

  const shippingSameAsBilling = watch('shippingSameAsBilling');

  const tabHasError: Record<CustomerFormTab, boolean> = {
    general: Boolean(errors.customerNumber || errors.name || errors.email),
    contacts: Boolean(errors.contacts),
    addresses: Boolean(errors.billingAddress),
    financial: Boolean(errors.currency || errors.creditLimit || errors.defaultDiscountPercent),
  };

  const tabs: FormTab[] = [
    {
      value: 'general',
      label: tabLabels.general,
      hasError: tabHasError.general,
      content: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="customer-number">Customer number</FieldLabel>
            <Input id="customer-number" {...register('customerNumber')} />
            <FieldError errors={[errors.customerNumber]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-name">Customer name</FieldLabel>
            <Input id="customer-name" {...register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-email">Email</FieldLabel>
            <Input id="customer-email" type="email" {...register('email')} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
            <Input id="customer-phone" {...register('phone')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-status">Status</FieldLabel>
            <Controller
              control={control}
              name="status"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="customer-status"
                  name="status"
                  value={field.value ?? 'active'}
                  onValueChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  options={STATUS_OPTIONS}
                />
              )}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
            <Textarea id="customer-notes" rows={3} {...register('notes')} />
          </Field>
        </div>
      ),
    },
    {
      value: 'contacts',
      label: tabLabels.contacts,
      hasError: tabHasError.contacts,
      content: (
        <div className="flex flex-col gap-4">
          {contactFields.length === 0 && <p className="text-sm text-muted-foreground">No contacts added yet.</p>}
          {contactFields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`contact-name-${field.id}`}>Name</FieldLabel>
                <Input id={`contact-name-${field.id}`} {...register(`contacts.${index}.name` as const)} />
                <FieldError errors={[errors.contacts?.[index]?.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`contact-role-${field.id}`}>Role</FieldLabel>
                <Input id={`contact-role-${field.id}`} {...register(`contacts.${index}.role` as const)} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`contact-email-${field.id}`}>Email</FieldLabel>
                <Input id={`contact-email-${field.id}`} type="email" {...register(`contacts.${index}.email` as const)} />
                <FieldError errors={[errors.contacts?.[index]?.email]} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`contact-phone-${field.id}`}>Phone</FieldLabel>
                <Input id={`contact-phone-${field.id}`} {...register(`contacts.${index}.phone` as const)} />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => removeContact(index)}>
                  <Trash2 data-icon="inline-start" />
                  Remove contact
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                appendContact({ id: `contact_${Date.now()}`, name: '', role: '', email: '', phone: '', isPrimary: false })
              }
            >
              <Plus data-icon="inline-start" />
              Add contact
            </Button>
          </div>
        </div>
      ),
    },
    {
      value: 'addresses',
      label: tabLabels.addresses,
      hasError: tabHasError.addresses,
      content: (
        <>
          <FormSection title="Billing address">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="billing-line1">Address line 1</FieldLabel>
                <Input id="billing-line1" {...register('billingAddress.line1')} />
                <FieldError errors={[errors.billingAddress?.line1]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="billing-line2">Address line 2</FieldLabel>
                <Input id="billing-line2" {...register('billingAddress.line2')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="billing-city">City</FieldLabel>
                <Input id="billing-city" {...register('billingAddress.city')} />
                <FieldError errors={[errors.billingAddress?.city]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="billing-state">Province/State</FieldLabel>
                <Input id="billing-state" {...register('billingAddress.state')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="billing-postal">Postal code</FieldLabel>
                <Input id="billing-postal" {...register('billingAddress.postalCode')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="billing-country">Country</FieldLabel>
                <Input id="billing-country" {...register('billingAddress.country')} />
                <FieldError errors={[errors.billingAddress?.country]} />
              </Field>
            </div>
          </FormSection>

          <Field orientation="horizontal">
            <input type="checkbox" id="shipping-same" className="size-4 rounded border-input" {...register('shippingSameAsBilling')} />
            <FieldLabel htmlFor="shipping-same" className="font-normal">
              Shipping address same as billing
            </FieldLabel>
          </Field>

          <FormSection title="Shipping address" className={shippingSameAsBilling ? 'hidden' : undefined}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="shipping-line1">Address line 1</FieldLabel>
                <Input id="shipping-line1" {...register('shippingAddress.line1')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="shipping-line2">Address line 2</FieldLabel>
                <Input id="shipping-line2" {...register('shippingAddress.line2')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="shipping-city">City</FieldLabel>
                <Input id="shipping-city" {...register('shippingAddress.city')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="shipping-state">Province/State</FieldLabel>
                <Input id="shipping-state" {...register('shippingAddress.state')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="shipping-postal">Postal code</FieldLabel>
                <Input id="shipping-postal" {...register('shippingAddress.postalCode')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="shipping-country">Country</FieldLabel>
                <Input id="shipping-country" {...register('shippingAddress.country')} />
              </Field>
            </div>
          </FormSection>
        </>
      ),
    },
    {
      value: 'financial',
      label: tabLabels.financial,
      hasError: tabHasError.financial,
      content: (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="customer-tax-number">Tax/VAT number</FieldLabel>
            <Input id="customer-tax-number" {...register('taxNumber')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-tax-status">Tax status</FieldLabel>
            <Controller
              control={control}
              name="taxStatus"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="customer-tax-status"
                  name="taxStatus"
                  value={field.value ?? 'taxable'}
                  onValueChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  options={TAX_STATUS_OPTIONS}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-currency">Currency</FieldLabel>
            <Controller
              control={control}
              name="currency"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="customer-currency"
                  name="currency"
                  value={field.value ?? 'ZAR'}
                  onValueChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  options={CURRENCY_OPTIONS}
                />
              )}
            />
            <FieldError errors={[errors.currency]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-payment-terms">Payment terms</FieldLabel>
            <Controller
              control={control}
              name="paymentTerms"
              render={({ field, fieldState }) => (
                <EnumSelect
                  id="customer-payment-terms"
                  name="paymentTerms"
                  value={field.value ?? 'COD'}
                  onValueChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                  options={PAYMENT_TERMS_OPTIONS}
                />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-credit-limit">Credit limit</FieldLabel>
            <Input id="customer-credit-limit" type="number" min="0" step="0.01" {...register('creditLimit')} />
            <FieldError errors={[errors.creditLimit]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="customer-discount">Default discount %</FieldLabel>
            <Input id="customer-discount" type="number" min="0" max="100" step="0.1" {...register('defaultDiscountPercent')} />
            <FieldError errors={[errors.defaultDiscountPercent]} />
          </Field>
          <Field orientation="horizontal" className="sm:col-span-2">
            <input type="checkbox" id="customer-credit-hold" className="size-4 rounded border-input" {...register('creditHold')} />
            <FieldLabel htmlFor="customer-credit-hold" className="font-normal">
              Place this customer on credit hold
            </FieldLabel>
          </Field>
        </div>
      ),
    },
  ];

  return (
    <form
      onSubmit={handleSubmit((values) => {
        void onSubmit(values);
      })}
      className="flex min-h-0 flex-1 flex-col"
    >
      <FormTabs
        tabs={tabs}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as CustomerFormTab)}
      />

      <FormFooter error={submitError ?? undefined}>
        <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create customer' : 'Save changes'}
        </Button>
      </FormFooter>
    </form>
  );
}
