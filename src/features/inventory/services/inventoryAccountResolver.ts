import type { ID, Product, ProductCategory } from '@/types';
import type { AccountMapper, AccountMappingKey } from '@/features/accounting/services/accountMappingService';

/**
 * The ONE authoritative inventory account resolver (Review 3B, item 20 & 21).
 *
 * Resolution hierarchy for every inventory-related GL account:
 *
 *   1. the product's own override column (`products.inventory_account_id`, …)
 *   2. the product's category (`product_categories`, via `products.category_id`)
 *   3. the generic semantic `AccountMappingKey` (`AccountMappingService`)
 *
 * `product_categories` (migration 0024) is authoritative. `category_account_mappings`
 * (migration 0019) was seeded FROM it and is now a frozen duplicate; a later
 * migration drops it and the Phase-2 `CategoryAccountMappingService` read path.
 * No numeric account codes appear in business logic — everything routes through
 * `AccountMapper` keys or a resolved category/product id.
 */

export type InventoryAccountRole = 'inventory' | 'cogs' | 'revenue' | 'adjustment' | 'purchase';

const GENERIC_KEY: Record<InventoryAccountRole, AccountMappingKey> = {
  inventory: 'INVENTORY',
  cogs: 'COGS',
  revenue: 'SALES_REVENUE',
  adjustment: 'INVENTORY_ADJUSTMENT',
  purchase: 'EXPENSE',
};

type ProductAccountFields = Pick<
  Product,
  'categoryId' | 'inventoryAccountId' | 'cogsAccountId' | 'salesAccountId' | 'purchaseAccountId'
>;

function productOverride(product: ProductAccountFields, role: InventoryAccountRole): ID | undefined {
  switch (role) {
    case 'inventory':
      return product.inventoryAccountId ?? undefined;
    case 'cogs':
      return product.cogsAccountId ?? undefined;
    case 'revenue':
      return product.salesAccountId ?? undefined;
    case 'purchase':
      return product.purchaseAccountId ?? undefined;
    case 'adjustment':
      return undefined; // no per-product adjustment override column — category or generic only
  }
}

function categoryAccount(category: ProductCategory, role: InventoryAccountRole): ID | undefined {
  switch (role) {
    case 'inventory':
      return category.inventoryAccountId ?? undefined;
    case 'cogs':
      return category.cogsAccountId ?? undefined;
    case 'revenue':
      return category.revenueAccountId ?? undefined;
    case 'adjustment':
      return category.adjustmentAccountId ?? undefined;
    case 'purchase':
      return undefined;
  }
}

/** Minimal surface this resolver needs from the product-category layer — keeps it unit-testable. */
export interface ProductCategoryLookup {
  getCategory(id: ID): Promise<ProductCategory | undefined>;
}

export interface InventoryAccountResolver {
  /** Resolve one account role for a product. Always returns a real id (throws only if the generic fallback account itself is missing from the chart). */
  resolveForProduct(product: ProductAccountFields, role: InventoryAccountRole): Promise<ID>;
  /** The generic semantic account for a role, no product context (e.g. opening-stock offset, in-transit). */
  resolveKey(key: AccountMappingKey): Promise<ID>;
}

export class InventoryAccountResolverService implements InventoryAccountResolver {
  private readonly categoryCache = new Map<ID, ProductCategory | undefined>();

  constructor(
    private readonly accounts: AccountMapper,
    private readonly categories: ProductCategoryLookup,
  ) {}

  async resolveKey(key: AccountMappingKey): Promise<ID> {
    return this.accounts.getAccountId(key);
  }

  async resolveForProduct(product: ProductAccountFields, role: InventoryAccountRole): Promise<ID> {
    const override = productOverride(product, role);
    if (override) return override;

    if (product.categoryId) {
      let category = this.categoryCache.get(product.categoryId);
      if (!this.categoryCache.has(product.categoryId)) {
        category = await this.categories.getCategory(product.categoryId);
        this.categoryCache.set(product.categoryId, category);
      }
      if (category) {
        const fromCategory = categoryAccount(category, role);
        if (fromCategory) return fromCategory;
      }
    }

    return this.accounts.getAccountId(GENERIC_KEY[role]);
  }
}
