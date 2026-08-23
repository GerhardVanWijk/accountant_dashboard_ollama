import type { SupabaseClient } from '@supabase/supabase-js';
import type { Address, ID, Warehouse } from '@/types';
import type { IWarehouseRepository } from './IWarehouseRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  address: Address | null;
  is_default: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    code: row.code,
    address: row.address ?? undefined,
    isDefault: row.is_default,
    status: row.status as Warehouse['status'],
  };
}

function warehouseToRow(entity: Partial<Warehouse>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.code !== undefined) row.code = entity.code;
  if (entity.address !== undefined) row.address = entity.address;
  if (entity.isDefault !== undefined) row.is_default = entity.isDefault;
  if (entity.status !== undefined) row.status = entity.status;
  return row;
}

/**
 * Supabase-backed IWarehouseRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase D). Resolves "the" company internally at create() time — same
 * single-tenant pattern as SupabaseAccountRepository.
 */
export class SupabaseWarehouseRepository implements IWarehouseRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseWarehouseRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<Warehouse[]> {
    const { data, error } = await this.client.from('warehouses').select('*').order('code', { ascending: true });
    if (error) throw new Error(`SupabaseWarehouseRepository.getAll: ${error.message}`);
    return (data as WarehouseRow[]).map(rowToWarehouse);
  }

  async getById(id: ID): Promise<Warehouse | undefined> {
    const { data, error } = await this.client.from('warehouses').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseWarehouseRepository.getById: ${error.message}`);
    }
    return data ? rowToWarehouse(data as WarehouseRow) : undefined;
  }

  async create(entity: Warehouse): Promise<Warehouse> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('warehouses')
      .insert({ ...warehouseToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseWarehouseRepository.create: ${error.message}`);
    return rowToWarehouse(data as WarehouseRow);
  }

  async update(id: ID, patch: Partial<Warehouse>): Promise<Warehouse> {
    const { data, error } = await this.client.from('warehouses').update(warehouseToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseWarehouseRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseWarehouseRepository: warehouse "${id}" not found`);
    return rowToWarehouse(data as WarehouseRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('warehouses').delete().eq('id', id);
    if (error) throw new Error(`SupabaseWarehouseRepository.delete: ${error.message}`);
  }
}
