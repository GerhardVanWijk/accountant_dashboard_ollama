import type { AuditAction, AuditLogEntry, ID } from '@/types';
import type { IAuditLogRepository } from '@/repositories/IAuditLogRepository';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';

export interface LogEntryInput {
  userId: ID;
  action: AuditAction;
  module: string;
  recordType: string;
  recordId: ID;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

/**
 * Cross-cutting audit trail service (docs/SA_ACCOUNTING_MASTER_SPEC.md §37).
 * Lives at the top level (not under one feature) because it has no single
 * domain owner — Accounting, Sales, Purchases, Banking, and Admin all write
 * to it and the Admin module's Audit page (src/features/admin/pages/AuditPage.tsx)
 * reads from it. Same top-level placement precedent as
 * IBillRepository/IInvoiceRepository/IPurchaseOrderRepository.
 */
export class AuditLogService {
  constructor(private readonly repository: IAuditLogRepository) {}

  async log(input: LogEntryInput): Promise<AuditLogEntry> {
    const now = new Date().toISOString();
    return this.repository.create({
      ...input,
      id: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  async getAll(): Promise<AuditLogEntry[]> {
    return this.repository.getAll();
  }

  async getForRecord(recordType: string, recordId: ID): Promise<AuditLogEntry[]> {
    return this.repository.getByRecord(recordType, recordId);
  }
}

/** Singleton every feature service should depend on rather than importing repositories directly. */
export const auditLogService = new AuditLogService(new MockAuditLogRepository());
