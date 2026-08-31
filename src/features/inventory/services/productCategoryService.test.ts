import { describe, expect, it } from 'vitest';
import type { Product, ProductCategory } from '@/types';
import { MockProductCategoryRepository } from '../repositories/MockProductCategoryRepository';
import { ProductCategoryService, type CreateProductCategoryDTO } from './productCategoryService';

function nowISO(): string {
  return new Date().toISOString();
}

function makeCategoryInput(overrides: Partial<CreateProductCategoryDTO> = {}): CreateProductCategoryDTO {
  return {
    name: 'Furniture',
    description: 'Desks, chairs, shelving',
    revenueAccountId: 'acc_rev_furniture',
    cogsAccountId: 'acc_cogs_furniture',
    inventoryAccountId: 'acc_inventory',
    adjustmentAccountId: 'acc_adjustment',
    isActive: true,
    ...overrides,
  };
}

function makeSeededCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'pcat_furniture',
    name: 'Furniture',
    revenueAccountId: 'acc_rev_furniture',
    cogsAccountId: 'acc_cogs_furniture',
    inventoryAccountId: 'acc_inventory',
    adjustmentAccountId: 'acc_adjustment',
    isActive: true,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod_1',
    sku: 'TST-001',
    name: 'Office Chair',
    type: 'good',
    unitPrice: 100,
    costPrice: 40,
    trackInventory: true,
    quantityOnHand: 0,
    reorderLevel: 10,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

function setup(seed: ProductCategory[] = [], products?: Product[]) {
  const repository = new MockProductCategoryRepository(seed);
  const productLookup = products ? { getAll: async () => products } : undefined;
  const auditEvents: Array<Record<string, unknown>> = [];
  const auditLog = { log: async (input: Record<string, unknown>) => void auditEvents.push(input) };
  const service = new ProductCategoryService(repository, productLookup, auditLog);
  return { service, repository, auditEvents };
}

describe('ProductCategoryService', () => {
  describe('CRUD round-trips', () => {
    it('creates, reads, updates and deletes a category', async () => {
      const { service } = setup();

      const created = await service.createCategory(makeCategoryInput());
      expect(created.id).toBeTruthy();
      expect(created.name).toBe('Furniture');
      expect(created.isActive).toBe(true);

      await expect(service.getCategory(created.id)).resolves.toMatchObject({ name: 'Furniture' });
      await expect(service.getCategories()).resolves.toHaveLength(1);

      const updated = await service.updateCategory(created.id, { description: 'Updated', isActive: false });
      expect(updated.description).toBe('Updated');
      expect(updated.isActive).toBe(false);
      expect(updated.name).toBe('Furniture');

      await service.deleteCategory(created.id);
      await expect(service.getCategories()).resolves.toHaveLength(0);
    });
  });

  describe('unique-name behaviour', () => {
    it('rejects a create whose name collides with an existing category', async () => {
      const { service } = setup([makeSeededCategory()]);
      await expect(service.createCategory(makeCategoryInput({ name: 'Furniture' }))).rejects.toThrow(/already exists/i);
    });

    it('rejects an update that renames one category onto another', async () => {
      const { service } = setup([
        makeSeededCategory({ id: 'pcat_a', name: 'Furniture' }),
        makeSeededCategory({ id: 'pcat_b', name: 'Consumables' }),
      ]);
      await expect(service.updateCategory('pcat_b', { name: 'Furniture' })).rejects.toThrow(/already exists/i);
    });

    it('allows an update that keeps the same name (self is excluded)', async () => {
      const { service } = setup([makeSeededCategory({ id: 'pcat_a', name: 'Furniture' })]);
      await expect(service.updateCategory('pcat_a', { name: 'Furniture', description: 'x' })).resolves.toMatchObject({
        description: 'x',
      });
    });
  });

  describe('account-mapping audit (item 21/22)', () => {
    it('emits inventory_account_mapping_changed when an account field changes', async () => {
      const { service, auditEvents } = setup([makeSeededCategory({ id: 'pcat_a' })]);
      await service.updateCategory('pcat_a', { cogsAccountId: 'acc_cogs_new' });
      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0]).toMatchObject({
        action: 'inventory_account_mapping_changed',
        module: 'inventory',
        recordType: 'product_category',
        recordId: 'pcat_a',
        previousValue: { cogsAccountId: 'acc_cogs_furniture' },
        newValue: { cogsAccountId: 'acc_cogs_new' },
      });
    });

    it('does NOT audit a plain rename / description edit', async () => {
      const { service, auditEvents } = setup([makeSeededCategory({ id: 'pcat_a' })]);
      await service.updateCategory('pcat_a', { name: 'Furniture & Fittings', description: 'x' });
      expect(auditEvents).toHaveLength(0);
    });

    it('does NOT audit when an account field is set to its current value', async () => {
      const { service, auditEvents } = setup([makeSeededCategory({ id: 'pcat_a' })]);
      await service.updateCategory('pcat_a', { cogsAccountId: 'acc_cogs_furniture' });
      expect(auditEvents).toHaveLength(0);
    });
  });

  describe('deleteCategory guard', () => {
    it('refuses to delete a category a product still references', async () => {
      const category = makeSeededCategory({ id: 'pcat_furniture' });
      const { service } = setup([category], [makeProduct({ categoryId: 'pcat_furniture' })]);
      await expect(service.deleteCategory('pcat_furniture')).rejects.toThrow(/still reference/i);
    });

    it('deletes when no product references the category', async () => {
      const category = makeSeededCategory({ id: 'pcat_furniture' });
      const { service } = setup([category], [makeProduct({ categoryId: 'pcat_other' })]);
      await service.deleteCategory('pcat_furniture');
      await expect(service.getCategories()).resolves.toHaveLength(0);
    });

    it('skips the guard entirely when no productLookup is injected', async () => {
      const { service } = setup([makeSeededCategory({ id: 'pcat_furniture' })]);
      await service.deleteCategory('pcat_furniture');
      await expect(service.getCategories()).resolves.toHaveLength(0);
    });
  });

  describe('resolveForCategory', () => {
    it('returns the mapped accounts for a seeded category', async () => {
      const { service } = setup([makeSeededCategory()]);
      await expect(service.resolveForCategory('Furniture')).resolves.toEqual({
        revenueAccountId: 'acc_rev_furniture',
        cogsAccountId: 'acc_cogs_furniture',
        inventoryAccountId: 'acc_inventory',
        adjustmentAccountId: 'acc_adjustment',
      });
    });

    it('returns all-undefined for an unknown category', async () => {
      const { service } = setup([makeSeededCategory()]);
      const resolved = await service.resolveForCategory('Nope');
      expect(resolved).toEqual({});
      expect(resolved.revenueAccountId).toBeUndefined();
      expect(resolved.adjustmentAccountId).toBeUndefined();
    });

    it('returns all-undefined when the category name is absent', async () => {
      const { service } = setup([makeSeededCategory()]);
      expect(await service.resolveForCategory(undefined)).toEqual({});
      expect(await service.resolveForCategory(null)).toEqual({});
      expect(await service.resolveForCategory('')).toEqual({});
    });

    it('passes through a partially-mapped category (null columns stay undefined)', async () => {
      const { service } = setup([
        makeSeededCategory({
          name: 'Promotional',
          revenueAccountId: 'acc_rev_promo',
          cogsAccountId: undefined,
          inventoryAccountId: undefined,
          adjustmentAccountId: undefined,
        }),
      ]);
      const resolved = await service.resolveForCategory('Promotional');
      expect(resolved.revenueAccountId).toBe('acc_rev_promo');
      expect(resolved.cogsAccountId).toBeUndefined();
      expect(resolved.inventoryAccountId).toBeUndefined();
    });
  });
});
