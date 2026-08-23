import type { ID, ISODateString } from './common';

/**
 * Mirrors `audit_logs_access` (migration 0010) — WHO accessed WHAT company's
 * data, WHEN, allowed or denied. Deliberately separate from
 * src/types/auditLog.ts's `AuditLogEntry` (the existing transactional audit
 * trail for posted GL/business-document changes) — different table,
 * different purpose: this one is access/security logging for the
 * Superuser + company-admin audit views, not a record of what a document's
 * fields changed to.
 *
 * Best-effort logging, not automatic query interception: this is a
 * client-only app with no backend, so there is no way to hook every RLS
 * denial and log it automatically (Postgres RLS silently returns zero rows;
 * it does not raise a client-visible "denied" error the app can catch).
 * `result: 'denied_rls' | 'denied_permission'` entries are only ever
 * written at explicit app-level checkpoints (e.g. a usePermission() gate
 * blocking an action before the request is even sent) — never as proof
 * every actual denial was captured.
 */
export type AuditAccessResult = 'allowed' | 'denied_rls' | 'denied_permission';

export interface AuditLogAccessEntry {
  id: ID;
  actorId?: ID;
  action: string;
  tableName: string;
  companyId?: ID;
  result: AuditAccessResult;
  detail?: Record<string, unknown>;
  occurredAt: ISODateString;
}
