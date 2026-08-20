import type { ActiveStatus, Address, BaseEntity, CurrencyCode, ID } from './common';

/** Payment terms offered to a customer — used for invoice due-date defaults. */
export type PaymentTerms = 'COD' | 'Net14' | 'Net30' | 'Net60';

/** VAT/tax treatment applied to this customer's sales documents. */
export type CustomerTaxStatus = 'taxable' | 'exempt' | 'zero-rated';

/** A named contact person at a customer business (Contacts tab). */
export interface CustomerContact {
  id: ID;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
}

export interface Customer extends BaseEntity {
  customerNumber: string;
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  taxNumber?: string;
  currency: CurrencyCode;
  /** Current accounts-receivable balance owed by this customer. */
  balance: number;
  status: ActiveStatus;
  notes?: string;
  ownerUserId?: ID;

  /** Maximum outstanding balance permitted before credit hold is warranted. */
  creditLimit?: number;
  /** Default invoice payment terms for this customer. */
  paymentTerms?: PaymentTerms;
  /** When true, new sales documents should be blocked/flagged (credit control). */
  creditHold?: boolean;
  /** VAT/tax treatment applied to this customer's sales documents. */
  taxStatus?: CustomerTaxStatus;
  /** Default line-item discount percentage applied on new sales documents. */
  defaultDiscountPercent?: number;
  /** Named contacts at this customer (Contacts tab). */
  contacts?: CustomerContact[];
}
