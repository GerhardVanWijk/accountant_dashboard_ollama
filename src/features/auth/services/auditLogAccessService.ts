import type { AuditLogAccessEntry, ID } from '@/types';
import type {
  IAuditLogAccessRepository,
  LogAccessDTO,
  LogAccessEventInput,
} from '@/repositories/auth/IAuditLogAccessRepository';

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

  /**
   * Record an access checkpoint through the `log_access_event` RPC —
   * actor/company are derived server-side and a repeated event inside the
   * dedupe window collapses to one row. Fire-and-forget: a logging failure
   * (offline, RLS, RPC error) never surfaces to the caller.
   */
  logEvent(input: LogAccessEventInput): void {
    // `Promise.resolve().then` so even a synchronous throw in the repo
    // (offline, mocked client) becomes a swallowed rejection, never an
    // error thrown into the caller's render/effect.
    void Promise.resolve()
      .then(() => this.repository.logEvent(input))
      .catch((error) => {
        console.error('AuditLogAccessService.logEvent failed:', error);
      });
  }

  /** Denied access to a protected area/feature. */
  logDenied(area: string, detail?: Record<string, unknown>): void {
    this.logEvent({ action: 'access_denied', area, result: 'denied_permission', detail, dedupeWindowMinutes: 60 });
  }

  /** Successful entry into a security-sensitive area (Payroll, Tax, Users, Audit, Billing…). */
  logSensitiveView(area: string, detail?: Record<string, unknown>): void {
    this.logEvent({ action: 'view', area, result: 'allowed', detail, dedupeWindowMinutes: 24 * 60 });
  }
}
