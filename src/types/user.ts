import type { ID, ISODateString } from './common';

/**
 * The coarse, DB-enforced access level (Postgres `profile_role` enum) that
 * actually gates every existing company-scoped table's RLS via
 * `get_my_company_id()`. Phase T's fine-grained roles/permissions system
 * (src/types/role.ts) is layered ON TOP of this for UI feature-gating and
 * the Superuser/Admin UIs — it does NOT replace this as the real backend
 * enforcement for the ~45 already-shipped tables. 'superuser' is the one
 * value added by Phase T (migration 0009); the rest predate it.
 */
export type ProfileRole = 'admin' | 'accountant' | 'manager' | 'operator' | 'viewer' | 'superuser';

/**
 * Real per-user identity — mirrors the `profiles` table (1:1 with
 * `auth.users`, auto-created by a DB trigger on signup). Replaces the old
 * Phase-0 `User` stub (roleId/status/avatarUrl fields that never matched
 * any real schema) now that Phase T ships real authentication.
 *
 * `companyId` is undefined for two legitimate reasons: a brand-new signup
 * that hasn't completed onboarding yet, or the superuser account (which
 * deliberately has no company — see docs/SUPABASE_MIGRATION_GUIDE.md's
 * Phase T section on why that alone blocks it from every company-scoped
 * table without any RLS rewrite).
 */
export interface Profile {
  id: ID;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: ProfileRole;
  companyId?: ID;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
