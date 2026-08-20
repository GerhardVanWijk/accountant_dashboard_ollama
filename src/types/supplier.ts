import type { ActiveStatus, Address, BaseEntity, CurrencyCode } from './common';

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
}
