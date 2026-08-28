import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { customerFormSchema, customerFormTabs, type CustomerFormTab, type CustomerFormValues } from '../utils/customerFormSchema';

export interface CustomerFormProps {
  mode: 'create' | 'edit';
  defaultValues: CustomerFormValues;
  onSubmit: (values: CustomerFormValues) => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  submitError?: string | null;
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
 * exact same customerFormSchema.ts every other CustomerForm
 * implementation used, unchanged. Only the JSX is re-skinned onto v0's
 * Field/Input/Tabs primitives. Used inside CustomerFormModal for both
 * create and edit flows.
 */
export function CustomerForm({ mode, defaultValues, onSubmit, onCancel, submitting, submitError }: CustomerFormProps) {
  const [activeTab, setActiveTab] = useState<CustomerFormTab>('general');

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues,
  });

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({
    control,
    name: 'contacts',
  });

  const shippingSameAsBilling = watch('shippingSameAsBilling');

  return (
    <form
      onSubmit={handleSubmit((values) => {
        void onSubmit(values);
      })}
      className="flex min-h-0 flex-1 flex-col gap-4 md:h-full"
    >
      {/*
        Stable tab region (docs/CURRENT_TASKS.md #3): the panels scroll
        inside this fixed-flex area so switching tabs never resizes the
        outer dialog, and the action row below stays anchored.
      */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as CustomerFormTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList variant="line" className="w-full justify-start border-b border-border">
          {customerFormTabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tabLabels[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className="app-scroll min-h-0 flex-1 overflow-y-auto pt-4">
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
              <NativeSelect id="customer-status" {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </NativeSelect>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
              <Textarea id="customer-notes" rows={3} {...register('notes')} />
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="app-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-4">
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
        </TabsContent>

        <TabsContent value="addresses" className="app-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pt-4">
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold">Billing address</legend>
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
          </fieldset>

          <Field orientation="horizontal">
            <input type="checkbox" id="shipping-same" className="size-4 rounded border-input" {...register('shippingSameAsBilling')} />
            <FieldLabel htmlFor="shipping-same" className="font-normal">
              Shipping address same as billing
            </FieldLabel>
          </Field>

          <fieldset hidden={shippingSameAsBilling} className="flex flex-col gap-4">
            <legend className="text-sm font-semibold">Shipping address</legend>
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
          </fieldset>
        </TabsContent>

        <TabsContent value="financial" className="app-scroll min-h-0 flex-1 overflow-y-auto pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="customer-tax-number">Tax/VAT number</FieldLabel>
              <Input id="customer-tax-number" {...register('taxNumber')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-tax-status">Tax status</FieldLabel>
              <NativeSelect id="customer-tax-status" {...register('taxStatus')}>
                <option value="taxable">Taxable</option>
                <option value="exempt">Exempt</option>
                <option value="zero-rated">Zero-rated</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-currency">Currency</FieldLabel>
              <NativeSelect id="customer-currency" {...register('currency')}>
                <option value="ZAR">ZAR — South African Rand</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="BWP">BWP — Botswana Pula</option>
                <option value="NAD">NAD — Namibian Dollar</option>
              </NativeSelect>
              <FieldError errors={[errors.currency]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-payment-terms">Payment terms</FieldLabel>
              <NativeSelect id="customer-payment-terms" {...register('paymentTerms')}>
                <option value="COD">COD</option>
                <option value="Net14">Net 14</option>
                <option value="Net30">Net 30</option>
                <option value="Net60">Net 60</option>
              </NativeSelect>
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
        </TabsContent>
      </Tabs>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create customer' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
