import type { ID, Permission } from '@/types';
import type { IPermissionRepository } from '@/repositories/auth/IPermissionRepository';

export class PermissionService {
  constructor(private readonly repository: IPermissionRepository) {}

  getAll(): Promise<Permission[]> {
    return this.repository.getAll();
  }

  getByRole(roleId: ID): Promise<Permission[]> {
    return this.repository.getByRole(roleId);
  }

  setGranted(roleId: ID, permissionId: ID, granted: boolean): Promise<void> {
    return this.repository.setGranted(roleId, permissionId, granted);
  }
}
