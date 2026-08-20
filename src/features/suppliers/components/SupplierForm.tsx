import { useState, type ReactNode } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { SUPPLIER_CATEGORIES } from '../types/supplier.types';
import { supplierFormSchema, type SupplierFormSchema } from '../utils/supplierFormSchema';

type TabKey = 'general' | 'contacts' | 'addresses' | 'financial';

const TABS: { key: TabKey; label: string; fields: (keyof SupplierFormSchema)[] }[] = [
  { key: 'general', label: 'General Info', fields: ['supplierNumber', 'name', 'category', 'status', 'onHold', 'currency', 'balance'] },
  { key: 'contacts', label: 'Primary Contacts', fields: ['email', 'phone', 'contactPerson'] },
  { key: 'addresses', label: 'Physical & Remittance Addresses', fields: ['address', 'remittanceAddress'] },
  {
    key: 'financial',
    label: 'Financial & Tax Settings',
    fields: ['taxNumber', 'creditLimit', 'paymentTerms', 'paymentMethod', 'settlementDiscountPercent', 'bankDetails', 'notes'],
  },
];

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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
 * Contacts / Physical & Remittance Addresses / Financial & Tax
 * Settings) backed by react-hook-form + zod. Business validation lives
 * in supplierFormSchema.ts, not inline in this component.
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
      className="flex flex-col gap-lg"
    >
      <div className="flex flex-wrap gap-xs border-b border-border" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-xs rounded-t-md px-md py-sm text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-primary text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {tab.label}
            {tabHasError(tab.fields, errors) && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 gap-md md:grid-cols-2">
          <Field label="Supplier Number" error={errors.supplierNumber?.message}>
            <input className={inputClass} {...register('supplierNumber')} />
          </Field>
          <Field label="Supplier Name" error={errors.name?.message}>
            <input className={inputClass} {...register('name')} />
          </Field>
          <Field label="Category">
            <select
              className={inputClass}
              {...register('category', { setValueAs: (v) => (v === '' ? undefined : v) })}
            >
              <option value="">Unassigned</option>
              {SUPPLIER_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" error={errors.currency?.message}>
            <input className={inputClass} {...register('currency')} />
          </Field>
          <Field label="Status">
            <select className={inputClass} {...register('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Opening Balance" error={errors.balance?.message}>
            <input type="number" step="0.01" className={inputClass} {...register('balance', { valueAsNumber: true })} />
          </Field>
          <Field label="Account Standing">
            <label className="flex items-center gap-sm text-sm text-text-primary">
              <input type="checkbox" {...register('onHold')} className="h-4 w-4 rounded border-border" />
              Place this supplier on hold
            </label>
          </Field>
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="grid grid-cols-1 gap-md md:grid-cols-2">
          <Field label="Contact Person">
            <input className={inputClass} {...register('contactPerson')} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input type="email" className={inputClass} {...register('email')} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} {...register('phone')} />
          </Field>
        </div>
      )}

      {activeTab === 'addresses' && (
        <div className="flex flex-col gap-lg">
          <fieldset className="flex flex-col gap-md">
            <legend className="text-sm font-semibold text-text-primary">Physical Address</legend>
            <div className="grid grid-cols-1 gap-md md:grid-cols-2">
              <Field label="Address Line 1">
                <input className={inputClass} {...register('address.line1')} />
              </Field>
              <Field label="Address Line 2">
                <input className={inputClass} {...register('address.line2')} />
              </Field>
              <Field label="City">
                <input className={inputClass} {...register('address.city')} />
              </Field>
              <Field label="Province/State">
                <input className={inputClass} {...register('address.state')} />
              </Field>
              <Field label="Postal Code">
                <input className={inputClass} {...register('address.postalCode')} />
              </Field>
              <Field label="Country">
                <input className={inputClass} {...register('address.country')} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-md">
            <legend className="text-sm font-semibold text-text-primary">Remittance Address (if different)</legend>
            <div className="grid grid-cols-1 gap-md md:grid-cols-2">
              <Field label="Address Line 1">
                <input className={inputClass} {...register('remittanceAddress.line1')} />
              </Field>
              <Field label="Address Line 2">
                <input className={inputClass} {...register('remittanceAddress.line2')} />
              </Field>
              <Field label="City">
                <input className={inputClass} {...register('remittanceAddress.city')} />
              </Field>
              <Field label="Province/State">
                <input className={inputClass} {...register('remittanceAddress.state')} />
              </Field>
              <Field label="Postal Code">
                <input className={inputClass} {...register('remittanceAddress.postalCode')} />
              </Field>
              <Field label="Country">
                <input className={inputClass} {...register('remittanceAddress.country')} />
              </Field>
            </div>
          </fieldset>
        </div>
      )}

      {activeTab === 'financial' && (
        <div className="flex flex-col gap-lg">
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            <Field label="Tax / VAT Registration Number">
              <input className={inputClass} {...register('taxNumber')} />
            </Field>
            <Field label="Default Tax Type">
              <input className={inputClass} value="Input VAT" disabled />
            </Field>
            <Field label="Credit Limit" error={errors.creditLimit?.message}>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                {...register('creditLimit', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              />
            </Field>
            <Field label="Payment Terms">
              <select
                className={inputClass}
                {...register('paymentTerms', { setValueAs: (v) => (v === '' ? undefined : v) })}
              >
                <option value="">Unassigned</option>
                <option value="Net14">Net 14</option>
                <option value="Net30">Net 30</option>
                <option value="EOM">EOM</option>
              </select>
            </Field>
            <Field label="Payment Method">
              <select
                className={inputClass}
                {...register('paymentMethod', { setValueAs: (v) => (v === '' ? undefined : v) })}
              >
                <option value="">Unassigned</option>
                <option value="EFT">EFT</option>
                <option value="Direct Debit">Direct Debit</option>
                <option value="Credit Card">Credit Card</option>
              </select>
            </Field>
            <Field label="Settlement Discount (%)" error={errors.settlementDiscountPercent?.message}>
              <input
                type="number"
                step="0.1"
                className={inputClass}
                {...register('settlementDiscountPercent', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
              />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-md">
            <legend className="text-sm font-semibold text-text-primary">Banking Details</legend>
            <div className="grid grid-cols-1 gap-md md:grid-cols-3">
              <Field label="Bank Name">
                <input className={inputClass} {...register('bankDetails.bankName')} />
              </Field>
              <Field label="Branch Code">
                <input className={inputClass} {...register('bankDetails.branchCode')} />
              </Field>
              <Field label="Account Number">
                <input className={inputClass} {...register('bankDetails.accountNumber')} />
              </Field>
            </div>
          </fieldset>

          <Field label="Notes">
            <textarea className={inputClass} rows={3} {...register('notes')} />
          </Field>
        </div>
      )}

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
