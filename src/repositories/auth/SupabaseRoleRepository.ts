import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, Role } from '@/types';
import type { CreateRoleDTO, IRoleRepository } from './IRoleRepository';

interface RoleRow {
  id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
}

function rowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    companyId: row.company_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    isCustom: row.is_custom,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Satisfies IRoleRepository against the real `roles` table (migration 0010). */
export class SupabaseRoleRepository implements IRoleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getById(id: ID): Promise<Role | undefined> {
    const { data, error } = await this.client.from('roles').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SupabaseRoleRepository.getById: ${error.message}`);
    return data ? rowToRole(data as RoleRow) : undefined;
  }

  async getSystemRoles(): Promise<Role[]> {
    const { data, error } = await this.client.from('roles').select('*').is('company_id', null).order('name', { ascending: true });
    if (error) throw new Error(`SupabaseRoleRepository.getSystemRoles: ${error.message}`);
    return (data as RoleRow[]).map(rowToRole);
  }

  async getByCompany(companyId: ID): Promise<Role[]> {
    const { data, error } = await this.client
      .from('roles')
      .select('*')
      .or(`company_id.is.null,company_id.eq.${companyId}`)
      .order('is_custom', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw new Error(`SupabaseRoleRepository.getByCompany: ${error.message}`);
    return (data as RoleRow[]).map(rowToRole);
  }

  async create(dto: CreateRoleDTO): Promise<Role> {
    const { data, error } = await this.client
      .from('roles')
      .insert({ name: dto.name, description: dto.description ?? null, company_id: dto.companyId, is_custom: true })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseRoleRepository.create: ${error.message}`);
    return rowToRole(data as RoleRow);
  }

  async update(id: ID, patch: Partial<Pick<Role, 'name' | 'description'>>): Promise<Role> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    const { data, error } = await this.client.from('roles').update(row).eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`SupabaseRoleRepository.update: ${error.message}`);
    if (!data) throw new Error(`SupabaseRoleRepository: role "${id}" not found or not editable (system roles can't be modified).`);
    return rowToRole(data as RoleRow);
  }

  async delete(id: ID): Promise<void> {
    const { error } = await this.client.from('roles').delete().eq('id', id);
    if (error) throw new Error(`SupabaseRoleRepository.delete: ${error.message}`);
  }
}
