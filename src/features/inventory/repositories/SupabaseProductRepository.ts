import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, Product } from '@/types';
import type { IProductRepository } from './IProductRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  type: string;
  unit_price: number;
  cost_price: number;
  tax_rate_id: string | null;
  track_inventory: boolean;
  quantity_on_hand: number;
  reorder_level: number | null;
  status: string;
  barcode: string | null;
  uom: string | null;
  category: string | null;
  valuation_method: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sku: row.sku,
    name: row.name,
    description: row.description ?? undefined,
    type: row.type as Product['type'],
    unitPrice: Number(row.unit_price),
    costPrice: Number(row.cost_price),
    taxRateId: row.tax_rate_id ?? undefined,
    trackInventory: row.track_inventory,
    quantityOnHand: Number(row.quantity_on_hand),
    reorderLevel: row.reorder_level === null ? undefined : Number(row.reorder_level),
    status: row.status as Product['status'],
    barcode: row.barcode ?? undefined,
    uom: row.uom ?? undefined,
    category: row.category ?? undefined,
    valuationMethod: (row.valuation_method as Product['valuationMethod']) ?? undefined,
  };
}

function productToRow(entity: Partial<Product>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.sku !== undefined) row.sku = entity.sku;
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.description !== undefined) row.description = entity.description;
  if (entity.type !== undefined) row.type = entity.type;
  if (entity.unitPrice !== undefined) row.unit_price = entity.unitPrice;
  if (entity.costPrice !== undefined) row.cost_price = entity.costPrice;
  if (entity.taxRateId !== undefined) row.tax_rate_id = entity.taxRateId;
  if (entity.trackInventory !== undefined) row.track_inventory = entity.trackInventory;
  if (entity.quantityOnHand !== undefined) row.quantity_on_hand = entity.quantityOnHand;
  if (entity.reorderLevel !== undefined) row.reorder_level = entity.reorderLevel;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.barcode !== undefined) row.barcode = entity.barcode;
  if (entity.uom !== undefined) row.uom = entity.uom;
  if (entity.category !== undefined) row.category = entity.category;
  if (entity.valuationMethod !== undefined) row.valuation_method = entity.valuationMethod;
  return row;
}

/**
 * Supabase-backed IProductRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase D). Resolves "the" company internally at create() time — same
 * single-tenant pattern as SupabaseAccountRepository. Stock movements/lots
 * (the transactional inventory ledger, as opposed to this master record)
 * stay Mock — Phase E's scope, not this one.
 */
export class SupabaseProductRepository implements IProductRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseProductRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Product[]> {
    const { data, error } = await this.client.from('products').select('*').order('sku', { ascending: true });
    if (error) throw new Error(`SupabaseProductRepository.getAll: ${error.message}`);
    return (data as ProductRow[]).map(rowToProduct);
  }

  async getById(id: ID): Promise<Product | undefined> {
    const { data, error } = await this.client.from('products').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseProductRepository.getById: ${error.message}`);
    }
    return data ? rowToProduct(data as ProductRow) : undefined;
  }

  async create(entity: Product): Promise<Product> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('products')
      .insert({ ...productToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseProductRepository.create: ${error.message}`);
    return rowToProduct(data as ProductRow);
  }

  async update(id: ID, patch: Partial<Product>): Promise<Product> {
    const { data, error } = await this.client.from('products').update(productToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseProductRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseProductRepository: product "${id}" not found`);
    return rowToProduct(data as ProductRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('products').delete().eq('id', id);
    if (error) throw new Error(`SupabaseProductRepository.delete: ${error.message}`);
  }
}
