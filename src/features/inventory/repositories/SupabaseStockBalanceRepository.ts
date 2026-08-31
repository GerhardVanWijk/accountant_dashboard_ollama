import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, StockBalance } from '@/types';
import type { IStockBalanceRepository } from './IStockBalanceRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

/**
 * Row shape of `stock_balances` (migration 0026 — authored, not yet
 * applied). snake_case ↔ camelCase mapping mirrors
 * SupabaseStockMovementRepository / SupabaseWarehouseRepository.
 *
 * NOTE: `stock_balances` has NO `created_at` column (it is a cache row, not
 * an event). The TS type still extends BaseEntity, so `createdAt` is mapped
 * from `updated_at` here — the same pragmatic choice
 * SupabaseWarehouseRepository-style cache rows make. Nothing reads
 * `StockBalance.createdAt` meaningfully.
 */
interface StockBalanceRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity_on_hand: number;
  quantity_committed: number;
  quantity_on_order: number;
  updated_at: string;
}

function rowToStockBalance(row: StockBalanceRow): StockBalance {
  return {
    id: row.id,
    // No created_at column on stock_balances — map from updated_at (cache row). See file header.
    createdAt: row.updated_at,
    updatedAt: row.updated_at,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    quantityOnHand: Number(row.quantity_on_hand),
    quantityCommitted: Number(row.quantity_committed),
    quantityOnOrder: Number(row.quantity_on_order),
  };
}

function stockBalanceToRow(entity: Partial<StockBalance>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.productId !== undefined) row.product_id = entity.productId;
  if (entity.warehouseId !== undefined) row.warehouse_id = entity.warehouseId;
  if (entity.quantityOnHand !== undefined) row.quantity_on_hand = entity.quantityOnHand;
  if (entity.quantityCommitted !== undefined) row.quantity_committed = entity.quantityCommitted;
  if (entity.quantityOnOrder !== undefined) row.quantity_on_order = entity.quantityOnOrder;
  return row;
}

/**
 * Supabase-backed IStockBalanceRepository. Resolves "the" company internally
 * at create() time — same single-tenant pattern as
 * SupabaseWarehouseRepository.
 *
 * NOTE: migration 0026 is authored but not yet applied, so this repo is not
 * wired into instances.ts yet and has no live coverage — the singleton in
 * stockBalanceService.ts uses the Mock repo for now. Swap once 0026 lands.
 */
export class SupabaseStockBalanceRepository implements IStockBalanceRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) {
      this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseStockBalanceRepository');
    }
    return this.cachedCompanyId;
  }

  async getAll(): Promise<StockBalance[]> {
    const { data, error } = await this.client.from('stock_balances').select('*');
    if (error) throw new Error(`SupabaseStockBalanceRepository.getAll: ${error.message}`);
    return (data as StockBalanceRow[]).map(rowToStockBalance);
  }

  async getById(id: ID): Promise<StockBalance | undefined> {
    const { data, error } = await this.client.from('stock_balances').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseStockBalanceRepository.getById: ${error.message}`);
    }
    return data ? rowToStockBalance(data as StockBalanceRow) : undefined;
  }

  async create(entity: StockBalance): Promise<StockBalance> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('stock_balances')
      .insert({ ...stockBalanceToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseStockBalanceRepository.create: ${error.message}`);
    return rowToStockBalance(data as StockBalanceRow);
  }

  async update(id: ID, patch: Partial<StockBalance>): Promise<StockBalance> {
    const { data, error } = await this.client
      .from('stock_balances')
      .update(stockBalanceToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseStockBalanceRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseStockBalanceRepository: balance "${id}" not found`);
    return rowToStockBalance(data as StockBalanceRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('stock_balances').delete().eq('id', id);
    if (error) throw new Error(`SupabaseStockBalanceRepository.delete: ${error.message}`);
  }
}
