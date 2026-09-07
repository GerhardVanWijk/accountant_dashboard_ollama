import type { AuditLogEntry, ID } from '@/types';

/** Server-side filter + paging for the Audit Trail page — the browser never loads the whole history. */
export interface AuditLogPageQuery {
  /** 0-based. */
  page: number;
  pageSize: number;
  module?: string;
  action?: string;
  /** Match any of these actions (used for KPI roll-ups like "financial postings"). */
  actions?: string[];
  userId?: string;
  recordType?: string;
  /** Inclusive ISO bounds on `createdAt`. */
  from?: string;
  to?: string;
  /** Free text, matched against `recordId` and `reason`. */
  search?: string;
}

export interface AuditLogPage {
  rows: AuditLogEntry[];
  /** Total matching rows across all pages. */
  total: number;
}

/**
 * Append-only audit log contract — same shape as
 * src/features/accounting/repositories/IJournalEntryRepository.ts and
 * src/features/inventory/repositories/IStockMovementRepository.ts. No
 * update()/delete() at all: docs/SA_ACCOUNTING_MASTER_SPEC.md §37 requires
 * audit logs to be append-only, so the interface itself makes editing or
 * deleting a log entry impossible for any caller, not just discouraged by
 * convention.
 */
export interface IAuditLogRepository {
  getAll(): Promise<AuditLogEntry[]>;
  getById(id: ID): Promise<AuditLogEntry | undefined>;
  getByRecord(recordType: string, recordId: ID): Promise<AuditLogEntry[]>;
  /** Filtered, ordered (newest first), paged slice — for the Audit Trail page. */
  getPage(query: AuditLogPageQuery): Promise<AuditLogPage>;
  create(entity: AuditLogEntry): Promise<AuditLogEntry>;
}
