import type { ID, UserRoleAssignment } from '@/types';
import type { IUserRoleRepository } from '@/repositories/auth/IUserRoleRepository';
import type { AuditLogService } from '@/services/auditLogService';

/** Assigns/removes Phase T fine-grained roles (src/types/role.ts) — the UI-gating layer, not the ProfileRole enum ProfileService.changeRole() manages. */
export class UserRoleService {
  constructor(
    private readonly repository: IUserRoleRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  getByCompany(companyId: ID): Promise<UserRoleAssignment[]> {
    return this.repository.getByCompany(companyId);
  }

  getByUser(userId: ID, companyId: ID): Promise<UserRoleAssignment[]> {
    return this.repository.getByUser(userId, companyId);
  }

  async assign(actorId: ID, userId: ID, roleId: ID, companyId: ID): Promise<UserRoleAssignment> {
    const assignment = await this.repository.assign(userId, roleId, companyId, actorId);
    await this.auditLog.log({
      userId: actorId,
      action: 'permission_changed',
      module: 'admin',
      recordType: 'UserRoleAssignment',
      recordId: userId,
      newValue: { roleId, companyId },
    });
    return assignment;
  }

  async unassign(actorId: ID, userId: ID, roleId: ID, companyId: ID): Promise<void> {
    await this.repository.unassign(userId, roleId, companyId);
    await this.auditLog.log({
      userId: actorId,
      action: 'permission_changed',
      module: 'admin',
      recordType: 'UserRoleAssignment',
      recordId: userId,
      previousValue: { roleId, companyId },
      reason: 'Role unassigned',
    });
  }
}
