import { supabase } from '@/config/supabase';
import type { ImportMappingProfile, SourceSystem } from './types';

interface ProfileRow {
  id: string;
  company_id: string | null;
  name: string;
  source_system: string;
  import_type: string;
  column_mappings: Record<string, unknown>;
  format_settings: Record<string, unknown>;
  account_mappings: Record<string, unknown>;
  tax_mappings: Record<string, unknown>;
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const PROFILE_COLUMNS = 'id, company_id, name, source_system, import_type, column_mappings, format_settings, account_mappings, tax_mappings, is_system, is_active, created_by, created_at, updated_at';

function mapProfile(row: ProfileRow): ImportMappingProfile {
  return {
    id: row.id,
    companyId: row.company_id ?? undefined,
    name: row.name,
    sourceSystem: row.source_system as SourceSystem,
    importType: row.import_type,
    columnMappings: row.column_mappings ?? {},
    formatSettings: row.format_settings ?? {},
    accountMappings: row.account_mappings ?? {},
    taxMappings: row.tax_mappings ?? {},
    isSystem: row.is_system,
    isActive: row.is_active,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every profile visible to this company (its own + system-shared), including inactive ones — callers filter as needed. */
export async function listMappingProfiles(importType?: string): Promise<ImportMappingProfile[]> {
  let query = supabase.from('import_mapping_profiles').select(PROFILE_COLUMNS).order('name', { ascending: true });
  if (importType) query = query.eq('import_type', importType);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapProfile(row as ProfileRow));
}

export interface SaveMappingProfileInput {
  name: string;
  sourceSystem: SourceSystem;
  importType: string;
  columnMappings: Record<string, unknown>;
  formatSettings?: Record<string, unknown>;
  accountMappings?: Record<string, unknown>;
  taxMappings?: Record<string, unknown>;
}

/** Saves a new COMPANY profile (Part 8) — system profiles are seed-only, never client-writable (see migration 0069's RLS). */
export async function saveMappingProfile(input: SaveMappingProfileInput): Promise<ImportMappingProfile> {
  const [{ data: userId }, { data: companyId, error: companyError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('get_my_company_id'),
  ]);
  if (companyError || !companyId) throw new Error(companyError?.message ?? 'Could not resolve the active company.');

  const { data, error } = await supabase
    .from('import_mapping_profiles')
    .insert({
      company_id: companyId,
      name: input.name,
      source_system: input.sourceSystem,
      import_type: input.importType,
      column_mappings: input.columnMappings,
      format_settings: input.formatSettings ?? {},
      account_mappings: input.accountMappings ?? {},
      tax_mappings: input.taxMappings ?? {},
      is_system: false,
      created_by: userId?.user?.id ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to save mapping profile.');
  return mapProfile(data as ProfileRow);
}

/** Company profiles only — duplicating a system profile creates a new, independently-editable company copy. */
export async function duplicateMappingProfile(profile: ImportMappingProfile, newName: string): Promise<ImportMappingProfile> {
  return saveMappingProfile({
    name: newName,
    sourceSystem: profile.sourceSystem,
    importType: profile.importType,
    columnMappings: profile.columnMappings,
    formatSettings: profile.formatSettings,
    accountMappings: profile.accountMappings,
    taxMappings: profile.taxMappings,
  });
}

export async function setMappingProfileActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('import_mapping_profiles').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(error.message);
}
