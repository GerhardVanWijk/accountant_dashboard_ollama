import { usePermissionStore } from '../stores/permissionStore';

/**
 * Feature-gating check against Phase T's fine-grained permission layer —
 * see src/types/user.ts's ProfileRole doc comment for the important
 * caveat: this hides/shows UI only. It does NOT restrict what the ~45
 * pre-existing tables' RLS actually allows (that's still ProfileRole-
 * gated). Reads from usePermissionStore, populated by <PermissionsLoader />.
 *
 * Usage:
 *   const canCreate = usePermission('invoicing', 'create');
 *   const canReadInvoicing = usePermission('invoicing'); // any action on this feature
 */
export function usePermission(feature: string, action?: string): boolean {
  const permissions = usePermissionStore((s) => s.permissions);
  return permissions.some((p) => p.feature === feature && (!action || p.action === action));
}
