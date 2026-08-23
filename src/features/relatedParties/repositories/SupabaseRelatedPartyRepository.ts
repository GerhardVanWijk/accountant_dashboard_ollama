import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, RelatedParty } from '@/types';
import type { IRelatedPartyRepository } from './IRelatedPartyRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface RelatedPartyRow {
  id: string;
  name: string;
  relationship_type: string;
  relationship_detail: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToRelatedParty(row: RelatedPartyRow): RelatedParty {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    relationshipType: row.relationship_type as RelatedParty['relationshipType'],
    relationshipDetail: row.relationship_detail ?? undefined,
    isActive: row.is_active,
  };
}

function relatedPartyToRow(entity: Partial<RelatedParty>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.name !== undefined) row.name = entity.name;
  if (entity.relationshipType !== undefined) row.relationship_type = entity.relationshipType;
  if (entity.relationshipDetail !== undefined) row.relationship_detail = entity.relationshipDetail;
  if (entity.isActive !== undefined) row.is_active = entity.isActive;
  return row;
}

/**
 * Supabase-backed IRelatedPartyRepository (docs/SUPABASE_MIGRATION_GUIDE.md
 * Phase G). `RelatedParty` has no `companyId` field — resolved internally,
 * same as every Phase D+ master-data type.
 */
export class SupabaseRelatedPartyRepository implements IRelatedPartyRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseRelatedPartyRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<RelatedParty[]> {
    const { data, error } = await this.client.from('related_parties').select('*').order('name', { ascending: true });
    if (error) throw new Error(`SupabaseRelatedPartyRepository.getAll: ${error.message}`);
    return (data as RelatedPartyRow[]).map(rowToRelatedParty);
  }

  async getById(id: ID): Promise<RelatedParty | undefined> {
    const { data, error } = await this.client.from('related_parties').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseRelatedPartyRepository.getById: ${error.message}`);
    }
    return data ? rowToRelatedParty(data as RelatedPartyRow) : undefined;
  }

  async create(entity: RelatedParty): Promise<RelatedParty> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('related_parties')
      .insert({ ...relatedPartyToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseRelatedPartyRepository.create: ${error.message}`);
    return rowToRelatedParty(data as RelatedPartyRow);
  }

  async update(id: ID, patch: Partial<RelatedParty>): Promise<RelatedParty> {
    const { data, error } = await this.client.from('related_parties').update(relatedPartyToRow(patch)).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseRelatedPartyRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseRelatedPartyRepository: related party "${id}" not found`);
    return rowToRelatedParty(data as RelatedPartyRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('related_parties').delete().eq('id', id);
    if (error) throw new Error(`SupabaseRelatedPartyRepository.delete: ${error.message}`);
  }
}
