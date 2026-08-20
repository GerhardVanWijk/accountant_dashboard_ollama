import { z } from 'zod';
import type { Address, Supplier, SupplierBankDetails } from '@/types';

/**
 * Address sub-schema used by both the physical and remittance address
 * tabs. Fields are optional strings — a supplier isn't required to have
 * either address on file — but SupplierForm only sends an address object
 * to the service layer once its `line1` is filled in (see
 * SupplierForm.tsx's toSupplierPatch).
 */
const addressFieldsSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const bankDetailsFieldsSchema = z.object({
  bankName: z.string().optional(),
  branchCode: z.string().optional(),
  accountNumber: z.string().optional(),
});

/**
 * react-hook-form + zod validation schema backing SupplierForm's four
 * tabs (General Info / Primary Contacts / Physical & Remittance
 * Addresses / Financial & Tax Settings).
 */
export const supplierFormSchema = z.object({
  // General Info
  supplierNumber: z.string().min(1, 'Supplier number is required'),
  name: z.string().min(1, 'Supplier name is required'),
  category: z.enum(['Raw Materials', 'Utilities', 'Trade Vendors', 'Services']).optional(),
  status: z.enum(['active', 'inactive']),
  onHold: z.boolean(),
  currency: z.string().min(1, 'Currency is required'),
  balance: z.number({ invalid_type_error: 'Balance must be a number' }),

  // Primary Contacts
  email: z.union([z.string().email('Enter a valid email address'), z.literal('')]).optional(),
  phone: z.string().optional(),
  contactPerson: z.string().optional(),

  // Physical & Remittance Addresses
  address: addressFieldsSchema.optional(),
  remittanceAddress: addressFieldsSchema.optional(),

  // Financial & Tax Settings
  taxNumber: z.string().optional(),
  creditLimit: z
    .number({ invalid_type_error: 'Credit limit must be a number' })
    .min(0, 'Credit limit cannot be negative')
    .optional(),
  paymentTerms: z.enum(['Net14', 'Net30', 'EOM']).optional(),
  paymentMethod: z.enum(['EFT', 'Direct Debit', 'Credit Card']).optional(),
  settlementDiscountPercent: z
    .number({ invalid_type_error: 'Settlement discount must be a number' })
    .min(0, 'Settlement discount cannot be negative')
    .max(100, 'Settlement discount cannot exceed 100%')
    .optional(),
  bankDetails: bankDetailsFieldsSchema.optional(),
  notes: z.string().optional(),
});

export type SupplierFormSchema = z.infer<typeof supplierFormSchema>;

function toAddress(fields?: SupplierFormSchema['address']): Address | undefined {
  if (!fields?.line1?.trim() || !fields.city?.trim() || !fields.country?.trim()) return undefined;
  return {
    line1: fields.line1.trim(),
    line2: fields.line2?.trim() || undefined,
    city: fields.city.trim(),
    state: fields.state?.trim() || undefined,
    postalCode: fields.postalCode?.trim() || undefined,
    country: fields.country.trim(),
  };
}

function toBankDetails(fields?: SupplierFormSchema['bankDetails']): SupplierBankDetails | undefined {
  if (!fields?.bankName?.trim() || !fields.branchCode?.trim() || !fields.accountNumber?.trim()) {
    return undefined;
  }
  return {
    bankName: fields.bankName.trim(),
    branchCode: fields.branchCode.trim(),
    accountNumber: fields.accountNumber.trim(),
  };
}

/**
 * Maps SupplierForm's flat, always-present-shape values onto a Supplier
 * patch — dropping address/bank sub-objects that were left entirely
 * blank rather than sending empty-string fields to the repository.
 */
export function mapFormValuesToSupplierPatch(
  values: SupplierFormSchema,
): Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    supplierNumber: values.supplierNumber.trim(),
    name: values.name.trim(),
    email: values.email?.trim() || undefined,
    phone: values.phone?.trim() || undefined,
    contactPerson: values.contactPerson?.trim() || undefined,
    category: values.category,
    status: values.status,
    onHold: values.onHold,
    currency: values.currency.trim(),
    balance: values.balance,
    creditLimit: values.creditLimit,
    paymentTerms: values.paymentTerms,
    paymentMethod: values.paymentMethod,
    settlementDiscountPercent: values.settlementDiscountPercent,
    taxNumber: values.taxNumber?.trim() || undefined,
    address: toAddress(values.address),
    remittanceAddress: toAddress(values.remittanceAddress),
    bankDetails: toBankDetails(values.bankDetails),
    notes: values.notes?.trim() || undefined,
  };
}
