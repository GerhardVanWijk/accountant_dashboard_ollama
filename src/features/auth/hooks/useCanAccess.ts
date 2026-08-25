import { useAuthStore } from '@/stores/authStore';
import { usePermission } from './usePermission';

/**
 * The composition rule used everywhere in this app that gates UI on the
 * Phase T fine-grained permission catalog (route guards, nav visibility,
 * action buttons): `Profile.role === 'admin' | 'superuser'` always passes,
 * regardless of `usePermission()`.
 *
 * Why: those two ProfileRole values already have full, unrestricted RLS
 * access to every company-scoped table (the coarse authorization layer —
 * see docs/PERMISSIONS.md). A UI-level block on top of that would not be
 * security, only theater — the same action remains one Supabase call away
 * either way. It would also create a real, immediate lockout: as of M11,
 * the live `user_roles` table has zero assignments for any account,
 * including the one real admin, so strict fail-closed gating would hide
 * the Users & Roles admin page (where roles get assigned) from the only
 * person who could ever assign one — a chicken-and-egg dead end with no
 * recovery path short of a manual SQL fix.
 *
 * Fine-grained gating becomes meaningful the moment an admin assigns a
 * non-admin/non-superuser user a role — the realistic use case this
 * catalog exists for (a bookkeeper who should see Invoicing but not
 * Payroll, etc.). See docs/PERMISSIONS.md for the full model.
 */
export function useCanAccess(feature: string, action?: string): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  const hasFineGrainedPermission = usePermission(feature, action);
  if (role === 'admin' || role === 'superuser') return true;
  return hasFineGrainedPermission;
}

/** True for the two ProfileRole values that bypass every fine-grained UI gate — see useCanAccess()'s doc comment. */
export function useIsPrivilegedRole(): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  return role === 'admin' || role === 'superuser';
}
