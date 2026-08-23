import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, Profile, ProfileRole } from '@/types';
import type { IProfileRepository } from './IProfileRepository';

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string;
  company_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    role: row.role as ProfileRole,
    companyId: row.company_id ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Satisfies IProfileRepository against the real `profiles` table. */
export class SupabaseProfileRepository implements IProfileRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getById(userId: ID): Promise<Profile | undefined> {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw new Error(`SupabaseProfileRepository.getById: ${error.message}`);
    return data ? rowToProfile(data as ProfileRow) : undefined;
  }

  async getByCompany(companyId: ID): Promise<Profile[]> {
    const { data, error } = await this.client.from('profiles').select('*').eq('company_id', companyId).order('created_at', { ascending: true });
    if (error) throw new Error(`SupabaseProfileRepository.getByCompany: ${error.message}`);
    return (data as ProfileRow[]).map(rowToProfile);
  }

  async getAll(): Promise<Profile[]> {
    const { data, error } = await this.client.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(`SupabaseProfileRepository.getAll: ${error.message}`);
    return (data as ProfileRow[]).map(rowToProfile);
  }

  async updateRole(userId: ID, role: ProfileRole): Promise<void> {
    const { error } = await this.client.from('profiles').update({ role }).eq('id', userId);
    if (error) throw new Error(`SupabaseProfileRepository.updateRole: ${error.message}`);
  }

  async updateCompany(userId: ID, companyId: ID | undefined): Promise<void> {
    const { error } = await this.client.from('profiles').update({ company_id: companyId ?? null }).eq('id', userId);
    if (error) throw new Error(`SupabaseProfileRepository.updateCompany: ${error.message}`);
  }

  async setActive(userId: ID, isActive: boolean): Promise<void> {
    const { error } = await this.client.from('profiles').update({ is_active: isActive }).eq('id', userId);
    if (error) throw new Error(`SupabaseProfileRepository.setActive: ${error.message}`);
  }

  async updateOwnProfile(userId: ID, patch: { firstName?: string; lastName?: string }): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.firstName !== undefined) row.first_name = patch.firstName;
    if (patch.lastName !== undefined) row.last_name = patch.lastName;
    const { error } = await this.client.from('profiles').update(row).eq('id', userId);
    if (error) throw new Error(`SupabaseProfileRepository.updateOwnProfile: ${error.message}`);
  }

  /**
   * role/isActive/createdAt/updatedAt below are placeholders, not real
   * values — the underlying RPC only ever returns id/email/first_name/
   * last_name (see migration 0014's comment on why it's this narrow). Only
   * ever render email/first/last name from this result; every other field
   * is a lie by construction.
   */
  async findUnassignedByEmail(email: string): Promise<Profile | undefined> {
    const { data, error } = await this.client.rpc('find_unassigned_profile_by_email', { p_email: email });
    if (error) throw new Error(`SupabaseProfileRepository.findUnassignedByEmail: ${error.message}`);
    const row = (data as { id: string; email: string | null; first_name: string | null; last_name: string | null }[])[0];
    if (!row) return undefined;
    return {
      id: row.id,
      email: row.email ?? undefined,
      firstName: row.first_name ?? undefined,
      lastName: row.last_name ?? undefined,
      role: 'viewer',
      companyId: undefined,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };
  }
}
