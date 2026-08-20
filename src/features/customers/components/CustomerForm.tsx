import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
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
  general: 'General Info',
  contacts: 'Contacts',
  addresses: 'Billing & Shipping',
  financial: 'Financial Settings',
};

const inputClassName =
  'w-full rounded-md border border-border bg-panel px-sm py-sm text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const labelClassName = 'flex flex-col gap-xs text-sm text-text-secondary';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="text-xs text-danger">{message}</span>;
}

/**
 * Multi-tab create/edit form (General Info / Contacts / Billing & Shipping
 * / Financial Settings), react-hook-form + zod validation. Used inside
 * CustomerFormModal for both create and edit flows.
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
      className="flex flex-col gap-lg"
    >
      <div role="tablist" aria-label="Customer form sections" className="flex flex-wrap gap-xs border-b border-border">
        {customerFormTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-t-md px-md py-sm text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-primary text-on-accent'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* General Info */}
      <div hidden={activeTab !== 'general'} className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <label className={labelClassName}>
          Customer Number
          <input className={inputClassName} {...register('customerNumber')} />
          <FieldError message={errors.customerNumber?.message} />
        </label>
        <label className={labelClassName}>
          Customer Name
          <input className={inputClassName} {...register('name')} />
          <FieldError message={errors.name?.message} />
        </label>
        <label className={labelClassName}>
          Email
          <input type="email" className={inputClassName} {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        <label className={labelClassName}>
          Phone
          <input className={inputClassName} {...register('phone')} />
        </label>
        <label className={labelClassName}>
          Status
          <select className={inputClassName} {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className={labelClassName}>
          Notes
          <textarea className={inputClassName} rows={3} {...register('notes')} />
        </label>
      </div>

      {/* Contacts */}
      <div hidden={activeTab !== 'contacts'} className="flex flex-col gap-md">
        {contactFields.length === 0 && (
          <p className="text-sm text-text-secondary">No contacts added yet.</p>
        )}
        {contactFields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-1 gap-sm rounded-md border border-border p-md sm:grid-cols-2">
            <label className={labelClassName}>
              Name
              <input className={inputClassName} {...register(`contacts.${index}.name` as const)} />
              <FieldError message={errors.contacts?.[index]?.name?.message} />
            </label>
            <label className={labelClassName}>
              Role
              <input className={inputClassName} {...register(`contacts.${index}.role` as const)} />
            </label>
            <label className={labelClassName}>
              Email
              <input type="email" className={inputClassName} {...register(`contacts.${index}.email` as const)} />
              <FieldError message={errors.contacts?.[index]?.email?.message} />
            </label>
            <label className={labelClassName}>
              Phone
              <input className={inputClassName} {...register(`contacts.${index}.phone` as const)} />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button variant="ghost" className="px-sm py-xs text-xs" onClick={() => removeContact(index)}>
                Remove Contact
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            variant="ghost"
            onClick={() =>
              appendContact({ id: `contact_${Date.now()}`, name: '', role: '', email: '', phone: '', isPrimary: false })
            }
          >
            Add Contact
          </Button>
        </div>
      </div>

      {/* Billing & Shipping Addresses */}
      <div hidden={activeTab !== 'addresses'} className="flex flex-col gap-lg">
        <fieldset className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <legend className="mb-xs text-sm font-semibold text-text-primary">Billing Address</legend>
          <label className={labelClassName}>
            Address Line 1
            <input className={inputClassName} {...register('billingAddress.line1')} />
            <FieldError message={errors.billingAddress?.line1?.message} />
          </label>
          <label className={labelClassName}>
            Address Line 2
            <input className={inputClassName} {...register('billingAddress.line2')} />
          </label>
          <label className={labelClassName}>
            City
            <input className={inputClassName} {...register('billingAddress.city')} />
            <FieldError message={errors.billingAddress?.city?.message} />
          </label>
          <label className={labelClassName}>
            Province/State
            <input className={inputClassName} {...register('billingAddress.state')} />
          </label>
          <label className={labelClassName}>
            Postal Code
            <input className={inputClassName} {...register('billingAddress.postalCode')} />
          </label>
          <label className={labelClassName}>
            Country
            <input className={inputClassName} {...register('billingAddress.country')} />
            <FieldError message={errors.billingAddress?.country?.message} />
          </label>
        </fieldset>

        <label className="flex items-center gap-xs text-sm text-text-secondary">
          <input type="checkbox" {...register('shippingSameAsBilling')} />
          Shipping address same as billing
        </label>

        <fieldset hidden={shippingSameAsBilling} className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <legend className="mb-xs text-sm font-semibold text-text-primary">Shipping Address</legend>
          <label className={labelClassName}>
            Address Line 1
            <input className={inputClassName} {...register('shippingAddress.line1')} />
          </label>
          <label className={labelClassName}>
            Address Line 2
            <input className={inputClassName} {...register('shippingAddress.line2')} />
          </label>
          <label className={labelClassName}>
            City
            <input className={inputClassName} {...register('shippingAddress.city')} />
          </label>
          <label className={labelClassName}>
            Province/State
            <input className={inputClassName} {...register('shippingAddress.state')} />
          </label>
          <label className={labelClassName}>
            Postal Code
            <input className={inputClassName} {...register('shippingAddress.postalCode')} />
          </label>
          <label className={labelClassName}>
            Country
            <input className={inputClassName} {...register('shippingAddress.country')} />
          </label>
        </fieldset>
      </div>

      {/* Financial Settings */}
      <div hidden={activeTab !== 'financial'} className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <label className={labelClassName}>
          Tax/VAT Number
          <input className={inputClassName} {...register('taxNumber')} />
        </label>
        <label className={labelClassName}>
          Tax Status
          <select className={inputClassName} {...register('taxStatus')}>
            <option value="taxable">Taxable</option>
            <option value="exempt">Exempt</option>
            <option value="zero-rated">Zero-Rated</option>
          </select>
        </label>
        <label className={labelClassName}>
          Currency
          <select className={inputClassName} {...register('currency')}>
            <option value="ZAR">ZAR — South African Rand</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="BWP">BWP — Botswana Pula</option>
            <option value="NAD">NAD — Namibian Dollar</option>
          </select>
          <FieldError message={errors.currency?.message} />
        </label>
        <label className={labelClassName}>
          Payment Terms
          <select className={inputClassName} {...register('paymentTerms')}>
            <option value="COD">COD</option>
            <option value="Net14">Net 14</option>
            <option value="Net30">Net 30</option>
            <option value="Net60">Net 60</option>
          </select>
        </label>
        <label className={labelClassName}>
          Credit Limit
          <input type="number" min="0" step="0.01" className={inputClassName} {...register('creditLimit')} />
          <FieldError message={errors.creditLimit?.message} />
        </label>
        <label className={labelClassName}>
          Default Discount %
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            className={inputClassName}
            {...register('defaultDiscountPercent')}
          />
          <FieldError message={errors.defaultDiscountPercent?.message} />
        </label>
        <label className="flex items-center gap-xs text-sm text-text-secondary sm:col-span-2">
          <input type="checkbox" {...register('creditHold')} />
          Place this customer on credit hold
        </label>
      </div>

      {submitError && <p className="text-sm text-danger">{submitError}</p>}

      <div className="flex justify-end gap-sm border-t border-border pt-md">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'create' ? 'Create Customer' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
