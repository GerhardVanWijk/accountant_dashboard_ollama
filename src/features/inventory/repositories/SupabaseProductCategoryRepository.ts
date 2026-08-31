import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, ProductCategory } from '@/types';
import type { IProductCategoryRepository } from './IProductCategoryRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

/**
 * Row shape of `product_categories` (migration 0024 — authored, not yet
 * applied). snake_case ↔ camelCase mapping mirrors
 * SupabaseProductRepository / SupabaseWarehouseRepository exactly.
 */
interface ProductCategoryRow {
  id: string;
  name: string;
  description: string | null;
  revenue_account_id: string | null;
  cogs_account_id: string | null;
  inventory_account_id: string | null;
  adjustment_account_id: string | null;
  default_tax_rate_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToProductCategory(row: ProductCategoryRow): ProductCategory {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    description: row.description ?? undefined,
    revenueAccountId: row.revenue_account_id ?? undefined,
    cogsAccountId: row.cogs_account_id ?? undefined,
    inventoryAccountId: row.inventory_account_id ?? undefined,
    adjustmentAccountId: row.adjustment_account_id ?? undefined,
    defaultTaxRateId: row.default_tax_rate_id ?? undefined,
    isActive: row.is_active,
  };
}

function productCategoryToRow(entity: Partial<ProductCategory>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.description !== undefined) row.description = entity.description;
  if (entity.revenueAccountId !== undefined) row.revenue_account_id = entity.revenueAccountId;
  if (entity.cogsAccountId !== undefined) row.cogs_account_id = entity.cogsAccountId;
  if (entity.inventoryAccountId !== undefined) row.inventory_account_id = entity.inventoryAccountId;
  if (entity.adjustmentAccountId !== undefined) row.adjustment_account_id = entity.adjustmentAccountId;
  if (entity.defaultTaxRateId !== undefined) row.default_tax_rate_id = entity.defaultTaxRateId;
  if (entity.isActive !== undefined) row.is_active = entity.isActive;
  return row;
}

/**
 * Supabase-backed IProductCategoryRepository. Resolves "the" company
 * internally at create() time — same single-tenant pattern as
 * SupabaseWarehouseRepository / SupabaseAccountRepository.
 *
 * NOTE: migration 0024 is authored but not yet applied, so this repo is not
 * wired into instances.ts yet and has no live coverage — the singleton in
 * productCategoryService.ts uses the Mock repo for now. Swap once 0024 lands.
 */
export class SupabaseProductCategoryRepository implements IProductCategoryRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) {
      this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseProductCategoryRepository');
    }
    return this.cachedCompanyId;
  }

  async getAll(): Promise<ProductCategory[]> {
    const { data, error } = await this.client.from('product_categories').select('*').order('name', { ascending: true });
    if (error) throw new Error(`SupabaseProductCategoryRepository.getAll: ${error.message}`);
    return (data as ProductCategoryRow[]).map(rowToProductCategory);
  }

  async getById(id: ID): Promise<ProductCategory | undefined> {
    const { data, error } = await this.client.from('product_categories').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseProductCategoryRepository.getById: ${error.message}`);
    }
    return data ? rowToProductCategory(data as ProductCategoryRow) : undefined;
  }

  async create(entity: ProductCategory): Promise<ProductCategory> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('product_categories')
      .insert({ ...productCategoryToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseProductCategoryRepository.create: ${error.message}`);
    return rowToProductCategory(data as ProductCategoryRow);
  }

  async update(id: ID, patch: Partial<ProductCategory>): Promise<ProductCategory> {
    const { data, error } = await this.client
      .from('product_categories')
      .update(productCategoryToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseProductCategoryRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseProductCategoryRepository: category "${id}" not found`);
    return rowToProductCategory(data as ProductCategoryRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('product_categories').delete().eq('id', id);
    if (error) throw new Error(`SupabaseProductCategoryRepository.delete: ${error.message}`);
  }
}
