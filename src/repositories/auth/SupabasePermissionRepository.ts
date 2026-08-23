import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, Permission } from '@/types';
import type { IPermissionRepository } from './IPermissionRepository';

interface PermissionRow {
  id: string;
  feature: string;
  action: string;
  description: string | null;
  created_at: string;
}

function rowToPermission(row: PermissionRow): Permission {
  return {
    id: row.id,
    feature: row.feature,
    action: row.action,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

/** Satisfies IPermissionRepository against the real `permissions`/`role_permissions` tables (migration 0010). */
export class SupabasePermissionRepository implements IPermissionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAll(): Promise<Permission[]> {
    const { data, error } = await this.client.from('permissions').select('*').order('feature', { ascending: true }).order('action', { ascending: true });
    if (error) throw new Error(`SupabasePermissionRepository.getAll: ${error.message}`);
    return (data as PermissionRow[]).map(rowToPermission);
  }

  async getById(id: ID): Promise<Permission | undefined> {
    const { data, error } = await this.client.from('permissions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`SupabasePermissionRepository.getById: ${error.message}`);
    return data ? rowToPermission(data as PermissionRow) : undefined;
  }

  async getByRole(roleId: ID): Promise<Permission[]> {
    const { data, error } = await this.client
      .from('role_permissions')
      .select('granted, permissions(*)')
      .eq('role_id', roleId)
      .eq('granted', true);
    if (error) throw new Error(`SupabasePermissionRepository.getByRole: ${error.message}`);
    return (data as unknown as { permissions: PermissionRow }[]).map((row) => rowToPermission(row.permissions));
  }

  async setGranted(roleId: ID, permissionId: ID, granted: boolean): Promise<void> {
    const { error } = await this.client
      .from('role_permissions')
      .upsert({ role_id: roleId, permission_id: permissionId, granted }, { onConflict: 'role_id,permission_id' });
    if (error) throw new Error(`SupabasePermissionRepository.setGranted: ${error.message}`);
  }
}
