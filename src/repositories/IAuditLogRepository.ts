import type { AuditLogEntry, ID } from '@/types';

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
  create(entity: AuditLogEntry): Promise<AuditLogEntry>;
}
