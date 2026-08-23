import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, StockMovement } from '@/types';
import type { IStockMovementRepository } from './IStockMovementRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface StockMovementRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  type: string;
  quantity_delta: number;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToStockMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    type: row.type as StockMovement['type'],
    quantityDelta: Number(row.quantity_delta),
    reference: row.reference ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function stockMovementToRow(entity: StockMovement): Record<string, unknown> {
  return {
    product_id: entity.productId,
    warehouse_id: entity.warehouseId,
    type: entity.type,
    quantity_delta: entity.quantityDelta,
    reference: entity.reference ?? null,
    notes: entity.notes ?? null,
  };
}

/**
 * Supabase-backed IStockMovementRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase E). Like SupabaseJournalEntryRepository, deliberately does NOT
 * implement the generic IRepository<T> — there is no update()/delete() to
 * implement, matching the interface exactly. Append-only enforced at the
 * DB layer too: RLS grants SELECT/INSERT only, and UPDATE/DELETE/TRUNCATE
 * are revoked from anon/authenticated (same pattern as Phase C's
 * journal_lines).
 */
export class SupabaseStockMovementRepository implements IStockMovementRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseStockMovementRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<StockMovement[]> {
    const { data, error } = await this.client.from('stock_movements').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`SupabaseStockMovementRepository.getAll: ${error.message}`);
    return (data as StockMovementRow[]).map(rowToStockMovement);
  }

  async getById(id: ID): Promise<StockMovement | undefined> {
    const { data, error } = await this.client.from('stock_movements').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseStockMovementRepository.getById: ${error.message}`);
    }
    return data ? rowToStockMovement(data as StockMovementRow) : undefined;
  }

  async create(entity: StockMovement): Promise<StockMovement> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('stock_movements')
      .insert({ ...stockMovementToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseStockMovementRepository.create: ${error.message}`);
    return rowToStockMovement(data as StockMovementRow);
  }
}
