import type { ID } from '@/types';

/**
 * One `category_account_mappings` row (migration
 * `0019_category_account_mappings`) in domain shape: a product-category
 * name mapped to the revenue / cost-of-sales / inventory accounts that
 * category's sales and purchases should post to. Any of the three account
 * ids may be absent (the column is nullable) — the caller falls back to
 * the generic `SALES_REVENUE` / `COGS` / `INVENTORY` mapping key for a
 * missing one.
 */
export interface CategoryAccountMappingRecord {
  categoryName: string;
  revenueAccountId?: ID;
  cogsAccountId?: ID;
  inventoryAccountId?: ID;
}

/**
 * Read surface `CategoryAccountMappingService` depends on. Kept to a single
 * `getAll()` — the mapping set is small (one row per product category) and
 * the service caches it after the first fetch, so there is no per-category
 * lookup method. Mirrors the "narrow interface, injected" pattern every
 * other repository in this folder follows.
 */
export interface ICategoryAccountMappingRepository {
  getAll(): Promise<CategoryAccountMappingRecord[]>;
}
