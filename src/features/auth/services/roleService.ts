import type { ID, Role } from '@/types';
import type { IRoleRepository } from '@/repositories/auth/IRoleRepository';
import type { AuditLogService } from '@/services/auditLogService';

export class RoleService {
  constructor(
    private readonly repository: IRoleRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  getSystemRoles(): Promise<Role[]> {
    return this.repository.getSystemRoles();
  }

  getByCompany(companyId: ID): Promise<Role[]> {
    return this.repository.getByCompany(companyId);
  }

  async createCustomRole(actorId: ID, companyId: ID, name: string, description: string | undefined): Promise<Role> {
    if (!name.trim()) throw new Error('A role name is required.');
    const role = await this.repository.create({ name: name.trim(), description, companyId });
    await this.auditLog.log({
      userId: actorId,
      action: 'created',
      module: 'admin',
      recordType: 'Role',
      recordId: role.id,
      newValue: { name: role.name },
    });
    return role;
  }

  async deleteCustomRole(actorId: ID, roleId: ID): Promise<void> {
    await this.repository.delete(roleId);
    await this.auditLog.log({
      userId: actorId,
      action: 'deleted',
      module: 'admin',
      recordType: 'Role',
      recordId: roleId,
    });
  }
}
