import { z } from 'zod';

/**
 * Zod schema backing CustomerForm (react-hook-form + zodResolver). Kept in
 * utils/ rather than the component per docs/DO_NOT_BREAK.md — validation
 * logic does not belong in JSX.
 */
const addressSchema = z.object({
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
});

const optionalEmail = z
  .string()
  .optional()
  .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address');

const contactSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Contact name is required'),
  role: z.string().optional(),
  email: optionalEmail,
  phone: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export const customerFormSchema = z.object({
  customerNumber: z.string().min(1, 'Customer number is required'),
  name: z.string().min(1, 'Customer name is required'),
  email: optionalEmail,
  phone: z.string().optional(),
  status: z.enum(['active', 'inactive']),

  contacts: z.array(contactSchema).optional(),

  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  shippingSameAsBilling: z.boolean().optional(),

  taxNumber: z.string().optional(),
  taxStatus: z.enum(['taxable', 'exempt', 'zero-rated']).optional(),
  currency: z.string().min(1, 'Currency is required'),
  paymentTerms: z.enum(['COD', 'Net14', 'Net30', 'Net60']).optional(),
  creditLimit: z.coerce.number().min(0, 'Credit limit cannot be negative').optional(),
  defaultDiscountPercent: z.coerce
    .number()
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .optional(),
  creditHold: z.boolean().optional(),
  notes: z.string().optional(),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export const customerFormTabs = ['general', 'contacts', 'addresses', 'financial'] as const;
export type CustomerFormTab = (typeof customerFormTabs)[number];
