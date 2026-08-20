import type { ActiveStatus, Address, BaseEntity, CurrencyCode } from './common';

/** Default payment terms offered by/agreed with a supplier. */
export type SupplierPaymentTerms = 'Net14' | 'Net30' | 'EOM';

/** Vendor category, used for filtering the Supplier Master Directory. */
export type SupplierCategory = 'Raw Materials' | 'Utilities' | 'Trade Vendors' | 'Services';

/** Preferred payment method for settling this supplier's bills. */
export type SupplierPaymentMethod = 'EFT' | 'Direct Debit' | 'Credit Card';

/** Default banking details used for payment batch generation. */
export interface SupplierBankDetails {
  bankName: string;
  branchCode: string;
  accountNumber: string;
}

export interface Supplier extends BaseEntity {
  supplierNumber: string;
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
  taxNumber?: string;
  currency: CurrencyCode;
  /** Current accounts-payable balance owed to this supplier. */
  balance: number;
  status: ActiveStatus;
  notes?: string;

  // --- Additive extensions (suppliers-bee) ---------------------------
  /** Maximum credit this vendor extends before purchasing is restricted. */
  creditLimit?: number;
  /** Default payment terms agreed with this vendor. */
  paymentTerms?: SupplierPaymentTerms;
  /** Vendor category used for Supplier Master Directory filtering. */
  category?: SupplierCategory;
  /** True when purchasing/payments to this vendor are frozen without full deactivation. */
  onHold?: boolean;
  /** Default banking details for payment batch generation. */
  bankDetails?: SupplierBankDetails;
  /** Primary contact person at the vendor for Primary Contacts tab. */
  contactPerson?: string;
  /** Remittance address, when different from the physical/trading address. */
  remittanceAddress?: Address;
  /** Preferred method used to pay this vendor. */
  paymentMethod?: SupplierPaymentMethod;
  /** Early-settlement discount offered by the vendor, as a percentage (0-100). */
  settlementDiscountPercent?: number;
}
