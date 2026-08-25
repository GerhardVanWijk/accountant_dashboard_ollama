import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import { navGroups, type NavGroup } from '@/lib/app/navigation';
import { permissionForPath } from '../permissionRouteMap';

/**
 * Filters the sidebar down to items the signed-in user can actually open —
 * same composition rule as `useCanAccess()` (admin/superuser bypass,
 * otherwise the real fine-grained permission set), but computed once here
 * rather than calling a hook per nav item inside a loop (which would
 * violate the Rules of Hooks). A nav item with no entry in
 * `permissionRouteMap.ts` (most of them — see that file's doc comment on
 * why) has nothing to check against and always stays visible; only items
 * mapped to a real permission the user lacks are hidden. Groups that end
 * up with zero visible items are dropped entirely so the sidebar never
 * shows an empty, unusable section header.
 */
export function useVisibleNavGroups(): NavGroup[] {
  const role = useAuthStore((s) => s.profile?.role);
  const permissions = usePermissionStore((s) => s.permissions);

  return useMemo(() => {
    const privileged = role === 'admin' || role === 'superuser';

    function canSee(href: string): boolean {
      if (privileged) return true;
      const required = permissionForPath(href);
      if (!required) return true;
      return permissions.some((p) => p.feature === required.feature && (!required.action || p.action === required.action));
    }

    return navGroups
      .map((group) => ({ ...group, items: group.items.filter((item) => canSee(item.href)) }))
      .filter((group) => group.items.length > 0);
  }, [role, permissions]);
}
