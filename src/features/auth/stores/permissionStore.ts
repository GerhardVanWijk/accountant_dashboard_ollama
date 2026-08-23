import { create } from 'zustand';
import type { Permission } from '@/types';

interface PermissionState {
  companyId: string | null;
  permissions: Permission[];
  loaded: boolean;
  setPermissions: (companyId: string, permissions: Permission[]) => void;
  clear: () => void;
}

/**
 * Holds the current user's UNION of granted permissions across every fine-
 * grained role assigned to them in the current company (Phase T). Populated
 * once by <PermissionsLoader /> (mounted in AppLayout), read by
 * usePermission() — matches the brief's own `usePermissionStore` shape
 * rather than every component independently re-fetching (the pattern
 * src/features/admin/hooks/useCompany.ts uses, which is fine for a single
 * rarely-mounted hook but would mean N duplicate network calls here).
 */
export const usePermissionStore = create<PermissionState>((set) => ({
  companyId: null,
  permissions: [],
  loaded: false,
  setPermissions: (companyId, permissions) => set({ companyId, permissions, loaded: true }),
  clear: () => set({ companyId: null, permissions: [], loaded: false }),
}));
