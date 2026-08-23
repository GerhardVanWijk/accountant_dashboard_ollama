import type { ID, Profile, ProfileRole } from '@/types';
import type { IProfileRepository } from '@/repositories/auth/IProfileRepository';
import type { AuditLogService } from '@/services/auditLogService';

/**
 * Wraps IProfileRepository with the audit trail every other admin-style
 * mutation in this codebase writes to (mirrors
 * src/features/admin/services/companyService.ts's setReportingFramework/
 * setSbcEligibility shape exactly) — role changes and suspensions are
 * exactly the kind of thing §37's audit trail exists for.
 */
export class ProfileService {
  constructor(
    private readonly repository: IProfileRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  getById(userId: ID): Promise<Profile | undefined> {
    return this.repository.getById(userId);
  }

  getByCompany(companyId: ID): Promise<Profile[]> {
    return this.repository.getByCompany(companyId);
  }

  /** Cross-company — only ever returns real rows for a caller whose own role is 'superuser' (RLS-enforced, not re-checked here). */
  getAll(): Promise<Profile[]> {
    return this.repository.getAll();
  }

  async changeRole(actorId: ID, targetUserId: ID, newRole: ProfileRole): Promise<void> {
    const target = await this.repository.getById(targetUserId);
    const previousRole = target?.role;
    await this.repository.updateRole(targetUserId, newRole);
    await this.auditLog.log({
      userId: actorId,
      action: 'permission_changed',
      module: 'admin',
      recordType: 'Profile',
      recordId: targetUserId,
      previousValue: { role: previousRole },
      newValue: { role: newRole },
    });
  }

  async setActive(actorId: ID, targetUserId: ID, isActive: boolean): Promise<void> {
    await this.repository.setActive(targetUserId, isActive);
    await this.auditLog.log({
      userId: actorId,
      action: 'edited',
      module: 'admin',
      recordType: 'Profile',
      recordId: targetUserId,
      newValue: { isActive },
      reason: isActive ? 'Reactivated' : 'Suspended',
    });
  }

  /** Admin-only exact-email lookup — see IProfileRepository.findUnassignedByEmail's caveat about which fields are real. */
  findUnassignedByEmail(email: string): Promise<Profile | undefined> {
    return this.repository.findUnassignedByEmail(email);
  }

  /** A company admin adds an already-signed-up, still-companyless user to their company. */
  async addExistingUserToCompany(actorId: ID, targetUserId: ID, companyId: ID): Promise<void> {
    await this.repository.updateCompany(targetUserId, companyId);
    await this.auditLog.log({
      userId: actorId,
      action: 'edited',
      module: 'admin',
      recordType: 'Profile',
      recordId: targetUserId,
      newValue: { companyId },
      reason: 'Added to company',
    });
  }

  updateOwnProfile(userId: ID, patch: { firstName?: string; lastName?: string }): Promise<void> {
    return this.repository.updateOwnProfile(userId, patch);
  }
}
