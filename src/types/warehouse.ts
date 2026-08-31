import type { ActiveStatus, Address, BaseEntity } from './common';

/**
 * A physical stock location. Products' quantities are tracked per warehouse
 * via the StockMovement ledger (src/types/stockMovement.ts) — see
 * docs/INVENTORY_DOMAIN.md for the stock control protocol.
 */
export interface Warehouse extends BaseEntity {
  name: string;
  code: string;
  address?: Address;
  /** The warehouse new stock/orders default to when none is explicitly chosen. Exactly one warehouse should carry this flag. */
  isDefault: boolean;
  status: ActiveStatus;
  /** Free-text operational notes (dock hours, contact, handling instructions). Inventory Accounting Module (Phase 2). */
  notes?: string;
}
