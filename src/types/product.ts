import type { ActiveStatus, BaseEntity, ID } from './common';

export type ProductType = 'good' | 'service';

export interface Product extends BaseEntity {
  sku: string;
  name: string;
  description?: string;
  type: ProductType;
  unitPrice: number;
  costPrice: number;
  taxRateId?: ID;
  /** Whether stock movements/quantities are tracked for this product. */
  trackInventory: boolean;
  quantityOnHand: number;
  reorderLevel?: number;
  status: ActiveStatus;
}
