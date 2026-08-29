import { describe, it, expect } from 'vitest';
import { CategoryAccountMappingService, nullCategoryAccountResolver } from './categoryAccountMappingService';
import { MockCategoryAccountMappingRepository } from '../repositories/MockCategoryAccountMappingRepository';
import type { CategoryAccountMappingRecord } from '../repositories/ICategoryAccountMappingRepository';

const FURNITURE: CategoryAccountMappingRecord = {
  categoryName: 'Furniture',
  revenueAccountId: 'acc_rev_furniture',
  cogsAccountId: 'acc_cogs_furniture',
  inventoryAccountId: 'acc_inventory',
};

/** A row where COGS is explicitly unmapped (null column) — must fall back. */
const PROMO: CategoryAccountMappingRecord = {
  categoryName: 'Promotional',
  revenueAccountId: 'acc_rev_promo',
  cogsAccountId: undefined,
  inventoryAccountId: undefined,
};

function makeService(rows: CategoryAccountMappingRecord[] = [FURNITURE, PROMO]) {
  return new CategoryAccountMappingService(new MockCategoryAccountMappingRepository(rows));
}

describe('CategoryAccountMappingService', () => {
  it('resolves a mapped category to all three account ids', async () => {
    const service = makeService();
    const resolved = await service.resolveForCategory('Furniture');
    expect(resolved).toEqual({
      revenueAccountId: 'acc_rev_furniture',
      cogsAccountId: 'acc_cogs_furniture',
      inventoryAccountId: 'acc_inventory',
    });
  });

  it('returns all-undefined for a category that has no mapping row', async () => {
    const service = makeService();
    const resolved = await service.resolveForCategory('Consumables');
    expect(resolved).toEqual({});
    expect(resolved.revenueAccountId).toBeUndefined();
    expect(resolved.cogsAccountId).toBeUndefined();
    expect(resolved.inventoryAccountId).toBeUndefined();
  });

  it('returns all-undefined when the category is absent (undefined / null / empty)', async () => {
    const service = makeService();
    expect(await service.resolveForCategory(undefined)).toEqual({});
    expect(await service.resolveForCategory(null)).toEqual({});
    expect(await service.resolveForCategory('')).toEqual({});
  });

  it('leaves a specific account undefined when that column is null on the mapping row', async () => {
    const service = makeService();
    const resolved = await service.resolveForCategory('Promotional');
    expect(resolved.revenueAccountId).toBe('acc_rev_promo');
    expect(resolved.cogsAccountId).toBeUndefined();
    expect(resolved.inventoryAccountId).toBeUndefined();
  });

  it('caches the mapping set after the first fetch (resolve-once)', async () => {
    let fetches = 0;
    const repo = { getAll: async () => { fetches += 1; return [FURNITURE]; } };
    const service = new CategoryAccountMappingService(repo);
    await service.resolveForCategory('Furniture');
    await service.resolveForCategory('Furniture');
    await service.resolveForCategory('Other');
    expect(fetches).toBe(1);
  });

  it('nullCategoryAccountResolver maps every category to no mapping', async () => {
    expect(await nullCategoryAccountResolver.resolveForCategory('Furniture')).toEqual({});
    expect(await nullCategoryAccountResolver.resolveForCategory(undefined)).toEqual({});
  });
});
