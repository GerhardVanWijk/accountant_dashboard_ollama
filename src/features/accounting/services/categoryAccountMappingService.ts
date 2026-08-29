import type { ID } from '@/types';
import type { ICategoryAccountMappingRepository } from '../repositories/ICategoryAccountMappingRepository';

/**
 * The revenue / cost-of-sales / inventory accounts a single product
 * category resolves to. Any field is `undefined` when that category has no
 * mapping row, or the row's specific account id is null — the posting
 * service then falls back to the generic `SALES_REVENUE` / `COGS` /
 * `INVENTORY` `AccountMappingKey` for that leg.
 */
export interface ResolvedCategoryAccounts {
  revenueAccountId?: ID;
  cogsAccountId?: ID;
  inventoryAccountId?: ID;
}

/**
 * Narrow surface the four posting paths (invoice / credit note / bill /
 * the COGS+inventory legs they drive) depend on — an interface, not the
 * concrete class, matching this codebase's `AccountMapper` /
 * `JournalPoster` / `InventoryMover` convention so each service stays
 * unit-testable with a stub.
 */
export interface CategoryAccountResolver {
  /**
   * Resolves a `products.category` value to its mapped accounts. Returns
   * an all-`undefined` result — never throws — when `categoryName` is
   * absent, empty, or has no mapping row, so an unmapped category always
   * falls back cleanly to the generic accounts.
   */
  resolveForCategory(categoryName: string | undefined | null): Promise<ResolvedCategoryAccounts>;
}

const EMPTY: ResolvedCategoryAccounts = Object.freeze({});

/**
 * Resolves a product category (`products.category`, a free-text string) to
 * the granular revenue / cost-of-sales / inventory accounts its sales and
 * purchases should post to — the per-category equivalent of
 * `AccountMappingService`'s fixed semantic-key → account-code map, backed
 * by the company-scoped `category_account_mappings` table (migration
 * `0019_category_account_mappings`) rather than a hardcoded convention.
 *
 * Caches the whole company mapping set after its first successful fetch
 * (one round trip for the service instance's lifetime, not one per journal
 * line) — same "resolve once" cache, and the same known limitation, as
 * `AccountMappingService`: a mapping row added later in the same session
 * won't be picked up without an app reload. Acceptable for the same
 * reason — category→account config is set up once, alongside the Chart of
 * Accounts, not edited mid-session while postings are running.
 */
export class CategoryAccountMappingService implements CategoryAccountResolver {
  private cachedByCategory: Map<string, ResolvedCategoryAccounts> | undefined;

  constructor(private readonly repository: ICategoryAccountMappingRepository) {}

  private async ensureCache(): Promise<Map<string, ResolvedCategoryAccounts>> {
    if (this.cachedByCategory) return this.cachedByCategory;
    const rows = await this.repository.getAll();
    this.cachedByCategory = new Map(
      rows.map((row) => [
        row.categoryName,
        {
          revenueAccountId: row.revenueAccountId ?? undefined,
          cogsAccountId: row.cogsAccountId ?? undefined,
          inventoryAccountId: row.inventoryAccountId ?? undefined,
        },
      ]),
    );
    return this.cachedByCategory;
  }

  async resolveForCategory(categoryName: string | undefined | null): Promise<ResolvedCategoryAccounts> {
    if (!categoryName) return EMPTY;
    const byCategory = await this.ensureCache();
    return byCategory.get(categoryName) ?? EMPTY;
  }
}

/**
 * A `CategoryAccountResolver` that maps every category to "no mapping", so
 * posting always falls back to the generic `AccountMapper` keys. The
 * default when a posting service is constructed without a real mapping
 * service (every existing unit test, and any mock-wired path) — keeps the
 * pre-21.3 single-line behaviour exactly unchanged there.
 */
export const nullCategoryAccountResolver: CategoryAccountResolver = {
  resolveForCategory: async () => EMPTY,
};
