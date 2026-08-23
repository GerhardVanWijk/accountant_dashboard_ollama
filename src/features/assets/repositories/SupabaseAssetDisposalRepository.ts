import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetDisposal, ID } from '@/types';
import type { IAssetDisposalRepository } from './IAssetDisposalRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface AssetDisposalRow {
  id: string;
  asset_id: string;
  disposal_date: string;
  proceeds: number;
  carrying_value_at_disposal: number;
  accumulated_depreciation_at_disposal: number;
  gain_loss: number;
  journal_entry_id: string;
  created_at: string;
  updated_at: string;
}

function rowToAssetDisposal(row: AssetDisposalRow): AssetDisposal {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assetId: row.asset_id,
    disposalDate: row.disposal_date,
    proceeds: Number(row.proceeds),
    carryingValueAtDisposal: Number(row.carrying_value_at_disposal),
    accumulatedDepreciationAtDisposal: Number(row.accumulated_depreciation_at_disposal),
    gainLoss: Number(row.gain_loss),
    journalEntryId: row.journal_entry_id,
  };
}

/**
 * Supabase-backed IAssetDisposalRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase F). Append-only — no update()/delete(). `getByAsset()` returns at
 * most one row (an asset can only be disposed once, enforced by
 * assetDisposalService, not this repository). Resolves "the" company
 * internally at create() time.
 */
export class SupabaseAssetDisposalRepository implements IAssetDisposalRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseAssetDisposalRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<AssetDisposal[]> {
    const { data, error } = await this.client.from('asset_disposals').select('*').order('disposal_date', { ascending: true });
    if (error) throw new Error(`SupabaseAssetDisposalRepository.getAll: ${error.message}`);
    return (data as AssetDisposalRow[]).map(rowToAssetDisposal);
  }

  async getById(id: ID): Promise<AssetDisposal | undefined> {
    const { data, error } = await this.client.from('asset_disposals').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseAssetDisposalRepository.getById: ${error.message}`);
    }
    return data ? rowToAssetDisposal(data as AssetDisposalRow) : undefined;
  }

  async getByAsset(assetId: ID): Promise<AssetDisposal | undefined> {
    const { data, error } = await this.client.from('asset_disposals').select('*').eq('asset_id', assetId).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseAssetDisposalRepository.getByAsset: ${error.message}`);
    }
    return data ? rowToAssetDisposal(data as AssetDisposalRow) : undefined;
  }

  async create(entity: AssetDisposal): Promise<AssetDisposal> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('asset_disposals')
      .insert({
        company_id: companyId,
        asset_id: entity.assetId,
        disposal_date: entity.disposalDate,
        proceeds: entity.proceeds,
        carrying_value_at_disposal: entity.carryingValueAtDisposal,
        accumulated_depreciation_at_disposal: entity.accumulatedDepreciationAtDisposal,
        gain_loss: entity.gainLoss,
        journal_entry_id: entity.journalEntryId,
      })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseAssetDisposalRepository.create: ${error.message}`);
    return rowToAssetDisposal(data as AssetDisposalRow);
  }
}
