import type { Customer } from '@/types';
import type { CreateCustomerDTO } from '../services/customerService';
import type { CustomerFormValues } from './customerFormSchema';

/** Builds react-hook-form defaultValues from an existing Customer (edit mode). */
export function customerToFormValues(customer: Customer): CustomerFormValues {
  return {
    customerNumber: customer.customerNumber,
    name: customer.name,
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    status: customer.status,
    contacts: customer.contacts ?? [],
    billingAddress: customer.billingAddress,
    shippingAddress: customer.shippingAddress,
    shippingSameAsBilling: false,
    taxNumber: customer.taxNumber ?? '',
    taxStatus: customer.taxStatus,
    currency: customer.currency,
    paymentTerms: customer.paymentTerms,
    creditLimit: customer.creditLimit,
    defaultDiscountPercent: customer.defaultDiscountPercent,
    creditHold: customer.creditHold ?? false,
    notes: customer.notes ?? '',
  };
}

/** Blank defaultValues for react-hook-form (create mode). */
export function blankFormValues(nextCustomerNumber: string): CustomerFormValues {
  return {
    customerNumber: nextCustomerNumber,
    name: '',
    email: '',
    phone: '',
    status: 'active',
    contacts: [],
    billingAddress: undefined,
    shippingAddress: undefined,
    shippingSameAsBilling: true,
    taxNumber: '',
    taxStatus: 'taxable',
    currency: 'ZAR',
    paymentTerms: 'Net30',
    creditLimit: undefined,
    defaultDiscountPercent: undefined,
    creditHold: false,
    notes: '',
  };
}

/**
 * Strips the UI-only `shippingSameAsBilling` toggle and empty-string
 * optional fields, applying the "same as billing" copy, before handing the
 * payload to the service layer.
 */
function cleanValues(values: CustomerFormValues): Omit<CustomerFormValues, 'shippingSameAsBilling'> {
  const { shippingSameAsBilling, ...rest } = values;
  const shippingAddress = shippingSameAsBilling ? rest.billingAddress : rest.shippingAddress;

  return {
    ...rest,
    email: rest.email || undefined,
    phone: rest.phone || undefined,
    taxNumber: rest.taxNumber || undefined,
    notes: rest.notes || undefined,
    shippingAddress,
    contacts: rest.contacts?.filter((contact) => contact.name.trim().length > 0),
  };
}

/** Maps form values to a CreateCustomerDTO for a brand-new customer (balance always starts at 0). */
export function formValuesToCreateDTO(values: CustomerFormValues): CreateCustomerDTO {
  const cleaned = cleanValues(values);
  return { ...cleaned, balance: 0 };
}

/** Maps form values to a partial patch for an existing customer (balance is never editable via the form). */
export function formValuesToUpdatePatch(values: CustomerFormValues): Partial<Customer> {
  return cleanValues(values);
}
