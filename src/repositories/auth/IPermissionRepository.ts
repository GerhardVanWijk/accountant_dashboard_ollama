import type { ID, Permission } from '@/types';

export interface IPermissionRepository {
  getAll(): Promise<Permission[]>;
  getById(id: ID): Promise<Permission | undefined>;
  /** Only permissions with role_permissions.granted = true. */
  getByRole(roleId: ID): Promise<Permission[]>;
  /** Grant/revoke one permission on a custom role. RLS rejects this for a system role or a role outside the caller's own company. */
  setGranted(roleId: ID, permissionId: ID, granted: boolean): Promise<void>;
}
