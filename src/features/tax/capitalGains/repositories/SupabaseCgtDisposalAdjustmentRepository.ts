import type { SupabaseClient } from '@supabase/supabase-js';
import type { CgtDisposalAdjustment, ID } from '@/types';
import type { ICgtDisposalAdjustmentRepository } from './ICgtDisposalAdjustmentRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface CgtDisposalAdjustmentRow {
  id: string;
  disposal_id: string;
  selling_costs: number;
  created_at: string;
  updated_at: string;
}

function rowToAdjustment(row: CgtDisposalAdjustmentRow): CgtDisposalAdjustment {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disposalId: row.disposal_id,
    sellingCosts: Number(row.selling_costs),
  };
}

function adjustmentToRow(entity: Partial<CgtDisposalAdjustment>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.disposalId !== undefined) row.disposal_id = entity.disposalId;
  if (entity.sellingCosts !== undefined) row.selling_costs = entity.sellingCosts;
  return row;
}

/**
 * Supabase-backed ICgtDisposalAdjustmentRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase F). Resolves "the" company
 * internally at create() time.
 */
export class SupabaseCgtDisposalAdjustmentRepository implements ICgtDisposalAdjustmentRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseCgtDisposalAdjustmentRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<CgtDisposalAdjustment[]> {
    const { data, error } = await this.client.from('cgt_disposal_adjustments').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`SupabaseCgtDisposalAdjustmentRepository.getAll: ${error.message}`);
    return (data as CgtDisposalAdjustmentRow[]).map(rowToAdjustment);
  }

  async getById(id: ID): Promise<CgtDisposalAdjustment | undefined> {
    const { data, error } = await this.client.from('cgt_disposal_adjustments').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseCgtDisposalAdjustmentRepository.getById: ${error.message}`);
    }
    return data ? rowToAdjustment(data as CgtDisposalAdjustmentRow) : undefined;
  }

  async getByDisposal(disposalId: ID): Promise<CgtDisposalAdjustment | undefined> {
    const { data, error } = await this.client.from('cgt_disposal_adjustments').select('*').eq('disposal_id', disposalId).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseCgtDisposalAdjustmentRepository.getByDisposal: ${error.message}`);
    }
    return data ? rowToAdjustment(data as CgtDisposalAdjustmentRow) : undefined;
  }

  async create(entity: CgtDisposalAdjustment): Promise<CgtDisposalAdjustment> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('cgt_disposal_adjustments')
      .insert({ ...adjustmentToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseCgtDisposalAdjustmentRepository.create: ${error.message}`);
    return rowToAdjustment(data as CgtDisposalAdjustmentRow);
  }

  async update(id: ID, patch: Partial<CgtDisposalAdjustment>): Promise<CgtDisposalAdjustment> {
    const { data, error } = await this.client.from('cgt_disposal_adjustments').update(adjustmentToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseCgtDisposalAdjustmentRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseCgtDisposalAdjustmentRepository: adjustment "${id}" not found`);
    return rowToAdjustment(data as CgtDisposalAdjustmentRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('cgt_disposal_adjustments').delete().eq('id', id);
    if (error) throw new Error(`SupabaseCgtDisposalAdjustmentRepository.delete: ${error.message}`);
  }
}
