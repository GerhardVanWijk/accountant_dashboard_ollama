import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, ReportingStandardVersion } from '@/types';
import type { IReportingStandardVersionRepository } from './IReportingStandardVersionRepository';
import { resolveDefaultCompanyId } from '@/repositories/resolveDefaultCompanyId';
import { isInvalidUuidError } from '@/repositories/supabaseErrors';

interface ReportingStandardVersionRow {
  id: string;
  standard: string;
  version_label: string;
  effective_from: string;
  early_adoption_permitted: boolean;
  superseded_by_version_id: string | null;
  source_reference: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToReportingStandardVersion(row: ReportingStandardVersionRow): ReportingStandardVersion {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    standard: row.standard as ReportingStandardVersion['standard'],
    versionLabel: row.version_label,
    effectiveFrom: row.effective_from,
    earlyAdoptionPermitted: row.early_adoption_permitted,
    supersededByVersionId: row.superseded_by_version_id ?? undefined,
    sourceReference: row.source_reference,
    notes: row.notes ?? undefined,
  };
}

function reportingStandardVersionToRow(entity: Partial<ReportingStandardVersion>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (entity.standard !== undefined) row.standard = entity.standard;
  if (entity.versionLabel !== undefined) row.version_label = entity.versionLabel;
  if (entity.effectiveFrom !== undefined) row.effective_from = entity.effectiveFrom;
  if (entity.earlyAdoptionPermitted !== undefined) row.early_adoption_permitted = entity.earlyAdoptionPermitted;
  if (entity.supersededByVersionId !== undefined) row.superseded_by_version_id = entity.supersededByVersionId;
  if (entity.sourceReference !== undefined) row.source_reference = entity.sourceReference;
  if (entity.notes !== undefined) row.notes = entity.notes;
  return row;
}

/**
 * Supabase-backed IReportingStandardVersionRepository
 * (docs/SUPABASE_MIGRATION_GUIDE.md Phase G). Full CRUD, matching the
 * interface's actual `IRepository<T>` contract — the doc comment's
 * TaxRate-style immutable/supersede()-only aspiration was NOT enforced at
 * the DB or interface layer (a deliberate, flagged decision; see the
 * migration guide entry). `ReportingStandardVersion` has no `companyId`
 * field — resolved internally, same as every Phase D+ master-data type.
 */
export class SupabaseReportingStandardVersionRepository implements IReportingStandardVersionRepository {
  private cachedCompanyId: ID | undefined;

  constructor(private readonly client: SupabaseClient) {}

  private async resolveCompanyId(): Promise<ID> {
    if (!this.cachedCompanyId) this.cachedCompanyId = await resolveDefaultCompanyId(this.client, 'SupabaseReportingStandardVersionRepository');
    return this.cachedCompanyId;
  }

  async getAll(): Promise<ReportingStandardVersion[]> {
    const { data, error } = await this.client.from('reporting_standard_versions').select('*').order('effective_from', { ascending: true });
    if (error) throw new Error(`SupabaseReportingStandardVersionRepository.getAll: ${error.message}`);
    return (data as ReportingStandardVersionRow[]).map(rowToReportingStandardVersion);
  }

  async getById(id: ID): Promise<ReportingStandardVersion | undefined> {
    const { data, error } = await this.client.from('reporting_standard_versions').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isInvalidUuidError(error)) return undefined;
      throw new Error(`SupabaseReportingStandardVersionRepository.getById: ${error.message}`);
    }
    return data ? rowToReportingStandardVersion(data as ReportingStandardVersionRow) : undefined;
  }

  async create(entity: ReportingStandardVersion): Promise<ReportingStandardVersion> {
    const companyId = await this.resolveCompanyId();
    const { data, error } = await this.client
      .from('reporting_standard_versions')
      .insert({ ...reportingStandardVersionToRow(entity), company_id: companyId })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseReportingStandardVersionRepository.create: ${error.message}`);
    return rowToReportingStandardVersion(data as ReportingStandardVersionRow);
  }

  async update(id: ID, patch: Partial<ReportingStandardVersion>): Promise<ReportingStandardVersion> {
    const { data, error } = await this.client
      .from('reporting_standard_versions')
      .update(reportingStandardVersionToRow(patch))
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`SupabaseReportingStandardVersionRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseReportingStandardVersionRepository: reporting standard version "${id}" not found`);
    return rowToReportingStandardVersion(data as ReportingStandardVersionRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('reporting_standard_versions').delete().eq('id', id);
    if (error) throw new Error(`SupabaseReportingStandardVersionRepository.delete: ${error.message}`);
  }
}
