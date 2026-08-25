import type { ActiveStatus, Supplier, SupplierCategory } from '@/types';

/** Values collected by SupplierForm's four tabs before mapping to a Supplier/DTO. */
export interface SupplierFormValues {
  supplierNumber: string;
  name: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  category?: SupplierCategory;
  status: ActiveStatus;
  onHold: boolean;
  currency: string;
  balance: number;
  creditLimit?: number;
  paymentTerms?: Supplier['paymentTerms'];
  paymentMethod?: Supplier['paymentMethod'];
  settlementDiscountPercent?: number;
  taxNumber?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  remittanceAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  bankDetails?: {
    bankName: string;
    branchCode: string;
    accountNumber: string;
  };
  notes?: string;
}

export const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  'Raw Materials',
  'Utilities',
  'Trade Vendors',
  'Services',
];
