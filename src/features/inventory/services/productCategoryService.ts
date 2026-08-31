import type { ID, Product, ProductCategory } from '@/types';
import type { CategoryAccountResolver, ResolvedCategoryAccounts } from '@/features/accounting/services';
import type { IProductCategoryRepository } from '../repositories/IProductCategoryRepository';
import { auditLogService } from '@/services/auditLogService';
import { productCategoryRepository } from '../repositories/instances';
import { productService } from './productService';

/** Narrow audit surface — same shape the other inventory services use. */
export interface ProductCategoryAuditLogger {
  log(input: {
    userId: ID;
    action: 'inventory_account_mapping_changed';
    module: string;
    recordType: string;
    recordId: ID;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }): Promise<unknown>;
}

/** The account-mapping fields on a category — a change to any of these is an auditable event. */
const ACCOUNT_FIELDS = [
  'revenueAccountId',
  'cogsAccountId',
  'inventoryAccountId',
  'adjustmentAccountId',
] as const;

export type CreateProductCategoryDTO = Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateProductCategoryDTO = Partial<Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * The accounts a line in a category posts to. Superset of the accounting
 * feature's `ResolvedCategoryAccounts` — adds `adjustmentAccountId` (where
 * shrinkage / write-offs / gains for the category post), which
 * `ProductCategory` carries but the legacy `category_account_mappings` did
 * not.
 */
export interface ResolvedProductCategoryAccounts extends ResolvedCategoryAccounts {
  adjustmentAccountId?: ID;
}

/**
 * Narrow injected surface used only by `deleteCategory` to block deleting a
 * category still referenced by a product. Kept as a one-method structural
 * type (not an import of productService) so this service never takes a hard
 * dependency on the products module — mirrors how `FixedAssetService` /
 * `billService` take narrow `JournalPoster` / `AccountMapper` stubs.
 */
export interface ProductLookup {
  getAll(): Promise<Product[]>;
}

const EMPTY: ResolvedProductCategoryAccounts = Object.freeze({});

/**
 * Business-logic layer for product categories (fork B; migration 0024),
 * mirroring `warehouseService.ts`'s shape (class + Create/Update DTOs +
 * singleton wired to a shared repo instance, docs/ARCHITECTURE.md).
 *
 * Also implements `CategoryAccountResolver` (features/accounting/services):
 * this is the forward-compatible replacement for
 * `CategoryAccountMappingService.resolveForCategory` once categories are
 * relational rather than the free-text `Product.category` +
 * `category_account_mappings` pair. That file is left untouched — the
 * posting layer can switch to this resolver when migration 0024 lands.
 */
export class ProductCategoryService implements CategoryAccountResolver {
  constructor(
    private readonly repository: IProductCategoryRepository,
    private readonly productLookup?: ProductLookup,
    private readonly auditLog?: ProductCategoryAuditLogger,
  ) {}

  async getCategories(): Promise<ProductCategory[]> {
    return this.repository.getAll();
  }

  async getCategory(id: ID): Promise<ProductCategory | undefined> {
    return this.repository.getById(id);
  }

  async createCategory(data: CreateProductCategoryDTO): Promise<ProductCategory> {
    await this.assertNameAvailable(data.name);
    const now = new Date().toISOString();
    return this.repository.create({
      ...data,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateCategory(id: ID, patch: UpdateProductCategoryDTO): Promise<ProductCategory> {
    if (patch.name !== undefined) {
      await this.assertNameAvailable(patch.name, id);
    }
    const before = this.auditLog ? await this.repository.getById(id) : undefined;
    const updated = await this.repository.update(id, patch);

    // Item 21/22: an account-mapping change on a category is an auditable
    // event (it re-points where a whole product family posts). A plain
    // rename / description edit is not.
    if (this.auditLog && before) {
      const changed = ACCOUNT_FIELDS.filter((f) => f in patch && patch[f] !== before[f]);
      if (changed.length > 0) {
        await this.auditLog.log({
          userId: 'system',
          action: 'inventory_account_mapping_changed',
          module: 'inventory',
          recordType: 'product_category',
          recordId: id,
          previousValue: Object.fromEntries(changed.map((f) => [f, before[f] ?? null])),
          newValue: Object.fromEntries(changed.map((f) => [f, updated[f] ?? null])),
          reason: `Category "${updated.name}" account mapping changed: ${changed.join(', ')}`,
        });
      }
    }
    return updated;
  }

  /**
   * Permanently removes a category. When a `productLookup` was injected,
   * refuses if any product still references the category
   * (`Product.categoryId`) — same class of guard as every other
   * referenced-master-data delete in this codebase. Without the lookup the
   * guard is simply skipped (keeps the service usable with no products
   * module wired).
   */
  async deleteCategory(id: ID): Promise<void> {
    if (this.productLookup) {
      const products = await this.productLookup.getAll();
      const referencing = products.filter((p) => p.categoryId === id);
      if (referencing.length > 0) {
        throw new Error(
          `Cannot delete category "${id}": ${referencing.length} product(s) still reference it. Re-assign them first.`,
        );
      }
    }
    return this.repository.delete(id);
  }

  /**
   * Resolves a category by `name` to its mapped GL accounts. Returns an
   * all-`undefined` result — never throws — when `categoryName` is absent,
   * empty, or has no matching category, so an unmapped category always
   * falls back cleanly to the generic `AccountMappingKey`s. Compatible with
   * `CategoryAccountResolver.resolveForCategory` (the accounting feature's
   * contract) and additionally carries `adjustmentAccountId`.
   */
  async resolveForCategory(categoryName: string | undefined | null): Promise<ResolvedProductCategoryAccounts> {
    if (!categoryName) return EMPTY;
    const categories = await this.repository.getAll();
    const match = categories.find((c) => c.name === categoryName);
    if (!match) return EMPTY;
    return {
      revenueAccountId: match.revenueAccountId,
      cogsAccountId: match.cogsAccountId,
      inventoryAccountId: match.inventoryAccountId,
      adjustmentAccountId: match.adjustmentAccountId,
    };
  }

  /** Enforces the `unique(company_id, name)` constraint (migration 0024) at the service layer for the Mock path. */
  private async assertNameAvailable(name: string, exceptId?: ID): Promise<void> {
    const categories = await this.repository.getAll();
    const clash = categories.find((c) => c.name === name && c.id !== exceptId);
    if (clash) {
      throw new Error(`A product category named "${name}" already exists.`);
    }
  }
}

/**
 * Singleton (Phase 3). Migration 0024 is applied, so this is Supabase-backed
 * via the shared `productCategoryRepository`. The delete-guard uses the real
 * `productService` (adapted to the one-method `ProductLookup`), and account-
 * mapping changes are audited through the app-wide `auditLogService`
 * (`inventory_account_mapping_changed`).
 */
export const productCategoryService = new ProductCategoryService(
  productCategoryRepository,
  { getAll: () => productService.getProducts() },
  auditLogService,
);
