import type { AuditAccessResult, AuditLogAccessEntry, ID } from '@/types';

export type LogAccessDTO = {
  actorId: ID;
  action: string;
  tableName: string;
  companyId?: ID;
  result: AuditAccessResult;
  detail?: Record<string, unknown>;
};

/**
 * A controlled access checkpoint written through the `log_access_event`
 * SECURITY DEFINER RPC (migration 0072): actor + company are taken from
 * the session server-side, and a same-actor/same-area/same-result event
 * inside `dedupeWindowMinutes` (default 60) is collapsed to one row.
 */
export type LogAccessEventInput = {
  /** Short verb, e.g. 'view', 'access_denied', 'suspended_access_attempt'. */
  action: string;
  /** The protected area or resource, e.g. 'User management', 'Payroll', 'Audit trail'. */
  area: string;
  result: AuditAccessResult;
  detail?: Record<string, unknown>;
  dedupeWindowMinutes?: number;
};

export interface IAuditLogAccessRepository {
  getByCompany(companyId: ID, limit: number): Promise<AuditLogAccessEntry[]>;
  getByUser(userId: ID, companyId: ID): Promise<AuditLogAccessEntry[]>;
  /** Direct insert — kept for the existing best-effort call sites. */
  log(entry: LogAccessDTO): Promise<void>;
  /** Preferred: dedupe + server-derived actor/company via the RPC. */
  logEvent(input: LogAccessEventInput): Promise<void>;
}
