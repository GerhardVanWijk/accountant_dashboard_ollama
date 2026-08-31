import type { BaseEntity, ID } from './common';

/**
 * A product category — the relational replacement for the free-text
 * `Product.category` string (fork B; migration 0024). Carries the GL account
 * mappings a line in this category posts to, folding in what
 * `category_account_mappings` (migration 0019) held. `Product.category` (text)
 * is kept during the transition and stays populated alongside
 * `Product.categoryId`.
 *
 * All account IDs are optional: an unmapped category falls back to the generic
 * AccountMappingKey, exactly as `CategoryAccountMappingService` already does.
 */
export interface ProductCategory extends BaseEntity {
  name: string;
  description?: string;
  revenueAccountId?: ID;
  cogsAccountId?: ID;
  inventoryAccountId?: ID;
  /** Where stock write-offs / shrinkage / gains for this category post (default: 5050 Inventory Adjustments). */
  adjustmentAccountId?: ID;
  defaultTaxRateId?: ID;
  isActive: boolean;
}
