import type { ProductCategory } from '@/types';

/**
 * Seed data for MockProductCategoryRepository
 * (src/features/inventory/repositories/).
 *
 * Intentionally empty: real product categories are created by the migration
 * 0024 seed against live company data (folding in the existing
 * `category_account_mappings` rows), not from a design-time fixture. The
 * Mock repo therefore starts from `[]` and tests seed their own rows.
 */
export const seedProductCategories: ProductCategory[] = [];
