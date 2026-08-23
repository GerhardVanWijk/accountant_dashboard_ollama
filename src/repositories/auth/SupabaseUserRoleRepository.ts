import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, UserRoleAssignment } from '@/types';
import type { IUserRoleRepository } from './IUserRoleRepository';

interface UserRoleRow {
  user_id: string;
  role_id: string;
  company_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

function rowToAssignment(row: UserRoleRow): UserRoleAssignment {
  return {
    userId: row.user_id,
    roleId: row.role_id,
    companyId: row.company_id,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by ?? undefined,
  };
}

/** Satisfies IUserRoleRepository against the real `user_roles` junction table (migration 0010). */
export class SupabaseUserRoleRepository implements IUserRoleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getByCompany(companyId: ID): Promise<UserRoleAssignment[]> {
    const { data, error } = await this.client.from('user_roles').select('*').eq('company_id', companyId);
    if (error) throw new Error(`SupabaseUserRoleRepository.getByCompany: ${error.message}`);
    return (data as UserRoleRow[]).map(rowToAssignment);
  }

  async getByUser(userId: ID, companyId: ID): Promise<UserRoleAssignment[]> {
    const { data, error } = await this.client.from('user_roles').select('*').eq('user_id', userId).eq('company_id', companyId);
    if (error) throw new Error(`SupabaseUserRoleRepository.getByUser: ${error.message}`);
    return (data as UserRoleRow[]).map(rowToAssignment);
  }

  async assign(userId: ID, roleId: ID, companyId: ID, assignedBy: ID | undefined): Promise<UserRoleAssignment> {
    const { data, error } = await this.client
      .from('user_roles')
      .upsert({ user_id: userId, role_id: roleId, company_id: companyId, assigned_by: assignedBy ?? null }, { onConflict: 'user_id,role_id,company_id' })
      .select('*')
      .single();
    if (error) throw new Error(`SupabaseUserRoleRepository.assign: ${error.message}`);
    return rowToAssignment(data as UserRoleRow);
  }

  async unassign(userId: ID, roleId: ID, companyId: ID): Promise<void> {
    const { error } = await this.client.from('user_roles').delete().eq('user_id', userId).eq('role_id', roleId).eq('company_id', companyId);
    if (error) throw new Error(`SupabaseUserRoleRepository.unassign: ${error.message}`);
  }
}
