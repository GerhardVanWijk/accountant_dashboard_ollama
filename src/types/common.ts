/**
 * Shared primitives used across every base domain type in src/types/.
 * Feature-specific extensions belong in src/features/*\/types/, not here.
 */

/** UUID string identifier used by every entity. */
export type ID = string;

/** ISO-8601 date-time string, e.g. "2026-08-20T12:00:00.000Z". */
export type ISODateString = string;

/** ISO 4217 currency code, e.g. "USD", "ZAR", "EUR". */
export type CurrencyCode = string;

/**
 * Fields every persisted entity carries. Concrete domain interfaces
 * extend this rather than redeclaring id/createdAt/updatedAt.
 */
export interface BaseEntity {
  id: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

/** Generic active/inactive lifecycle shared by directory-style entities. */
export type ActiveStatus = 'active' | 'inactive';

/** Debit/credit — the two sides of every double-entry accounting line. */
export type DebitCredit = 'debit' | 'credit';

/**
 * A single priced line on a sales or purchase document
 * (quote, sales order, invoice, purchase order, bill).
 */
export interface DocumentLineItem {
  id: ID;
  productId?: ID;
  /**
   * Which warehouse this line's stock actually moved through. Optional —
   * when omitted, `InventoryPostingAdapter`
   * (src/features/inventory/services/inventoryPostingAdapter.ts) falls
   * back to `Warehouse.isDefault`, so every existing document (and every
   * single-warehouse business) keeps working unchanged. Only meaningful
   * alongside `productId`.
   */
  warehouseId?: ID;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRateId?: ID;
  taxAmount: number;
  lineTotal: number;
}
