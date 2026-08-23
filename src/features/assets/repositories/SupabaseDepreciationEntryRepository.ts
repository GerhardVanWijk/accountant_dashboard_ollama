import type { SupabaseClient } from '@supabase/supabase-js';
import type { DepreciationEntry, ID } from '@/types';
import type { IDepreciationEntryRepository } from './IDepreciationEntryRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface DepreciationEntryRow {
  id: string;
  asset_id: string;
  period_end: string;
  amount: number;
  accumulated_depreciation_after: number;
  carrying_value_after: number;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
}

function rowToDepreciationEntry(row: DepreciationEntryRow): DepreciationEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assetId: row.asset_id,
    periodEnd: row.period_end,
    amount: Number(row.amount),
    accumulatedDepreciationAfter: Number(row.accumulated_depreciation_after),
    carryingValueAfter: Number(row.carrying_value_after),
    journalEntryId: row.journal_entry_id,
  };
}

/**
 * Supabase-backed IDepreciationEntryRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Append-only — no update()/delete(), matching the interface.
 * Resolves "the" company internally at create() time.
 */
export class SupabaseDepreciationEntryRepository implements IDepreciationEntryRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseDepreciationEntryRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<DepreciationEntry[]> {
    const { data, error } = await this.client.from('depreciation_entries').select('*').order('period_end', { ascending: true });
    if (error) throw new Error(`SupabaseDepreciationEntryRepository.getAll: ${error.message}`);
    return (data as DepreciationEntryRow[]).map(rowToDepreciationEntry);
  }

  async getById(id: ID): Promise<DepreciationEntry | undefined> {
    const { data, error } = await this.client.from('depreciation_entries').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseDepreciationEntryRepository.getById: ${error.message}`);
    }
    return data ? rowToDepreciationEntry(data as DepreciationEntryRow) : undefined;
  }

  async getByAsset(assetId: ID): Promise<DepreciationEntry[]> {
    const { data, error } = await this.client
      .from('depreciation_entries')
      .select('*')
      .eq('asset_id', assetId)
      .order('period_end', { ascending: true });
    if (error) {
      if (isInvalidUuidError(error)) return [];
      throw new Error(`SupabaseDepreciationEntryRepository.getByAsset: ${error.message}`);
    }
    return (data as DepreciationEntryRow[]).map(rowToDepreciationEntry);
  }

  async create(entity: DepreciationEntry): Promise<DepreciationEntry> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('depreciation_entries')
      .insert({
        company_id: companyId,
        asset_id: entity.assetId,
        period_end: entity.periodEnd,
        amount: entity.amount,
        accumulated_depreciation_after: entity.accumulatedDepreciationAfter,
        carrying_value_after: entity.carryingValueAfter,
        journal_entry_id: entity.journalEntryId,
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseDepreciationEntryRepository.create: ${error.message}`);
    return rowToDepreciationEntry(data as DepreciationEntryRow);
  }
}
