import type { ID, Profile, ProfileRole } from '@/types';

/**
 * Mirrors the `profiles` table (1:1 with `auth.users`, auto-created by a DB
 * trigger on signup — see docs/SUPABASE_MIGRATION_GUIDE.md's Phase A
 * section). Named IProfileRepository rather than the brief's literal
 * "IUserRepository" to match the real table; no `create()` method exists
 * here for the same reason — a profile is never client-created, only
 * updated once the trigger has made it.
 */
export interface IProfileRepository {
  getById(userId: ID): Promise<Profile | undefined>;
  getByCompany(companyId: ID): Promise<Profile[]>;
  /** Superuser-only in practice — RLS only returns cross-company rows to a caller whose own role is 'superuser'. */
  getAll(): Promise<Profile[]>;
  updateRole(userId: ID, role: ProfileRole): Promise<void>;
  updateCompany(userId: ID, companyId: ID | undefined): Promise<void>;
  setActive(userId: ID, isActive: boolean): Promise<void>;
  updateOwnProfile(userId: ID, patch: { firstName?: string; lastName?: string }): Promise<void>;
  /** Admin-only, exact match, via the find_unassigned_profile_by_email RPC (migration 0014) — see its comment for why this isn't a plain SELECT. */
  findUnassignedByEmail(email: string): Promise<Profile | undefined>;
}
