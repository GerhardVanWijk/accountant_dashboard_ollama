import { describe, expect, it, vi } from 'vitest';
import type { ID, Product, ProductCategory } from '@/types';
import type { AccountMapper, AccountMappingKey } from '@/features/accounting/services/accountMappingService';
import { InventoryAccountResolverService } from './inventoryAccountResolver';

/**
 * Part F of the product/category integration fix. Proves the account
 * resolution hierarchy the whole inventory + sales/purchase posting layer
 * depends on:
 *
 *   1. the product's own override column
 *   2. the product's category (product_categories, via products.category_id)
 *   3. the generic semantic AccountMappingKey
 *
 * The bug this fixes: `SupabaseProductRepository` never mapped
 * `products.category_id`, so branch 2 was unreachable in the running app —
 * every product resolved to the generic key even when its category carried
 * a specific revenue/COGS/inventory account.
 */

const GENERIC: Record<AccountMappingKey, ID> = {
  SALES_REVENUE: 'acc-generic-4000',
  COGS: 'acc-generic-5000',
  INVENTORY: 'acc-generic-1200',
  INVENTORY_ADJUSTMENT: 'acc-generic-5050',
  EXPENSE: 'acc-generic-6000',
} as unknown as Record<AccountMappingKey, ID>;

function fakeAccounts(): AccountMapper {
  return {
    getAccountId: vi.fn(async (key: AccountMappingKey) => GENERIC[key] ?? `acc-generic-${key}`),
  };
}

function category(over: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'cat-consumables',
    name: 'Consumables',
    isActive: true,
    revenueAccountId: 'acc-cat-4040',
    cogsAccountId: 'acc-cat-5040',
    inventoryAccountId: 'acc-cat-1200',
    adjustmentAccountId: 'acc-cat-5050',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    sku: 'CON-001',
    name: 'Black Toner Cartridge',
    type: 'good',
    unitPrice: 1249,
    costPrice: 783,
    trackInventory: true,
    quantityOnHand: 100,
    status: 'active',
    categoryId: 'cat-consumables',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function resolver(cat: ProductCategory | undefined) {
  return new InventoryAccountResolverService(fakeAccounts(), {
    getCategory: vi.fn(async (id: ID) => (cat && cat.id === id ? cat : undefined)),
  });
}

describe('InventoryAccountResolverService — precedence', () => {
  it('2 — a linked category supplies the revenue / COGS / inventory account', async () => {
    const r = resolver(category());
    expect(await r.resolveForProduct(product(), 'revenue')).toBe('acc-cat-4040');
    expect(await r.resolveForProduct(product(), 'cogs')).toBe('acc-cat-5040');
    expect(await r.resolveForProduct(product(), 'inventory')).toBe('acc-cat-1200');
    expect(await r.resolveForProduct(product(), 'adjustment')).toBe('acc-cat-5050');
  });

  it('1 — a per-product override wins over the category', async () => {
    const r = resolver(category());
    const p = product({ salesAccountId: 'acc-prod-4999', cogsAccountId: 'acc-prod-5999', inventoryAccountId: 'acc-prod-1999' });
    expect(await r.resolveForProduct(p, 'revenue')).toBe('acc-prod-4999');
    expect(await r.resolveForProduct(p, 'cogs')).toBe('acc-prod-5999');
    expect(await r.resolveForProduct(p, 'inventory')).toBe('acc-prod-1999');
    // no per-product adjustment override column — still falls to the category
    expect(await r.resolveForProduct(p, 'adjustment')).toBe('acc-cat-5050');
  });

  it('3 — no category link falls through to the generic key', async () => {
    const r = resolver(category());
    const p = product({ categoryId: undefined });
    expect(await r.resolveForProduct(p, 'revenue')).toBe('acc-generic-4000');
    expect(await r.resolveForProduct(p, 'cogs')).toBe('acc-generic-5000');
    expect(await r.resolveForProduct(p, 'inventory')).toBe('acc-generic-1200');
  });

  it('3 — a category with no account for a role falls through to the generic key', async () => {
    const r = resolver(category({ revenueAccountId: undefined, cogsAccountId: undefined }));
    expect(await r.resolveForProduct(product(), 'revenue')).toBe('acc-generic-4000');
    expect(await r.resolveForProduct(product(), 'cogs')).toBe('acc-generic-5000');
    // the one it does carry still comes from the category
    expect(await r.resolveForProduct(product(), 'inventory')).toBe('acc-cat-1200');
  });

  it('3 — a categoryId that no longer resolves falls through to the generic key (no throw)', async () => {
    const r = resolver(undefined);
    expect(await r.resolveForProduct(product({ categoryId: 'cat-deleted' }), 'revenue')).toBe('acc-generic-4000');
  });

  it('caches the category lookup — one fetch per category across many roles', async () => {
    const getCategory = vi.fn(async () => category());
    const r = new InventoryAccountResolverService(fakeAccounts(), { getCategory });
    await r.resolveForProduct(product(), 'revenue');
    await r.resolveForProduct(product(), 'cogs');
    await r.resolveForProduct(product(), 'inventory');
    expect(getCategory).toHaveBeenCalledTimes(1);
  });
});
