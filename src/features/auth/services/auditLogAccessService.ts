import type { AuditLogAccessEntry, ID } from '@/types';
import type { IAuditLogAccessRepository, LogAccessDTO } from '@/repositories/auth/IAuditLogAccessRepository';

/** See src/types/accessAudit.ts for the "best-effort checkpoint logging, not automatic query interception" scope note. */
export class AuditLogAccessService {
  constructor(private readonly repository: IAuditLogAccessRepository) {}

  getByCompany(companyId: ID, limit = 200): Promise<AuditLogAccessEntry[]> {
    return this.repository.getByCompany(companyId, limit);
  }

  getByUser(userId: ID, companyId: ID): Promise<AuditLogAccessEntry[]> {
    return this.repository.getByUser(userId, companyId);
  }

  /** Fire-and-forget by design — a logging failure must never block the action it's logging. */
  log(entry: LogAccessDTO): void {
    this.repository.log(entry).catch((error) => {
      console.error('AuditLogAccessService.log failed:', error);
    });
  }
}
