import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '../stores/permissionStore';
import { navGroups, type NavGroup } from '@/lib/app/navigation';
import { permissionForPath } from '../permissionRouteMap';
import { entitlementForPath } from '@/features/subscriptions/entitlementRouteMap';
import { CORE_ENTITLEMENTS } from '@/features/subscriptions/entitlements';
import { useEntitlementStore } from '@/features/subscriptions/stores/entitlementStore';

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
  const entitlements = useEntitlementStore((s) => s.entitlements);
  const entitlementsLoaded = useEntitlementStore((s) => s.loaded);

  return useMemo(() => {
    const privileged = role === 'admin' || role === 'superuser';
    const isSuperuser = role === 'superuser';

    /** Layer 3 — the user's fine-grained permission. admin/superuser bypass. */
    function hasPermission(href: string): boolean {
      if (privileged) return true;
      const required = permissionForPath(href);
      if (!required) return true;
      return permissions.some((p) => p.feature === required.feature && (!required.action || p.action === required.action));
    }

    /** Layer 2 — the company's plan entitlement. superuser bypasses; admin does NOT. */
    function hasEntitlement(href: string): boolean {
      if (isSuperuser) return true;
      const key = entitlementForPath(href);
      if (!key || CORE_ENTITLEMENTS.includes(key)) return true;
      if (!entitlementsLoaded) return true; // don't hide anything until we know
      return entitlements.has(key);
    }

    return navGroups
      .map((group) => ({ ...group, items: group.items.filter((item) => hasPermission(item.href) && hasEntitlement(item.href)) }))
      .filter((group) => group.items.length > 0);
  }, [role, permissions, entitlements, entitlementsLoaded]);
}
