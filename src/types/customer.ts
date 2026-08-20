import type { ActiveStatus, Address, BaseEntity, CurrencyCode, ID } from './common';

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
}
