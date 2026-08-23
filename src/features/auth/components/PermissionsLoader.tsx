import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import { userRoleService, permissionService } from '../services';

/**
 * Loads the signed-in user's fine-grained permission set once per
 * (userId, companyId) and populates usePermissionStore — mount this once
 * near the root of the protected app shell (AppLayout), not per-page.
 * Renders nothing.
 *
 * A user with no explicit user_roles assignment yet (the common case right
 * after Phase T ships — nothing auto-assigns the new system roles to
 * existing profiles) loads an empty permission set, so every
 * usePermission()-gated control stays hidden until a company admin assigns
 * them a role from the Users & Roles admin page. That's correct fail-closed
 * behavior, not a bug.
 */
export function PermissionsLoader() {
  const userId = useAuthStore((s) => s.profile?.id);
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const setPermissions = usePermissionStore((s) => s.setPermissions);
  const clear = usePermissionStore((s) => s.clear);

  useEffect(() => {
    if (!userId || !companyId) {
      clear();
      return;
    }
    let cancelled = false;
    userRoleService.getByUser(userId, companyId).then(async (assignments) => {
      const permissionLists = await Promise.all(assignments.map((a) => permissionService.getByRole(a.roleId)));
      if (cancelled) return;
      const merged = new Map(permissionLists.flat().map((p) => [p.id, p]));
      setPermissions(companyId, Array.from(merged.values()));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, companyId, setPermissions, clear]);

  return null;
}
