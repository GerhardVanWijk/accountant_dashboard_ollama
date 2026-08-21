import type { AuditLogEntry } from '@/types';
import type { IAuditLogRepository } from '../IAuditLogRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `audit_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of the append-only audit log
 * (IAuditLogRepository). Like MockJournalEntryRepository/
 * MockStockMovementRepository, there is no update()/delete() to implement —
 * create() is the only write path.
 */
export class MockAuditLogRepository implements IAuditLogRepository {
  private entries: AuditLogEntry[];

  constructor(initialData: AuditLogEntry[] = []) {
    this.entries = initialData.map((e) => ({ ...e }));
  }

  async getAll(): Promise<AuditLogEntry[]> {
    return [...this.entries];
  }

  async getById(id: string): Promise<AuditLogEntry | undefined> {
    return this.entries.find((e) => e.id === id);
  }

  async getByRecord(recordType: string, recordId: string): Promise<AuditLogEntry[]> {
    return this.entries.filter((e) => e.recordType === recordType && e.recordId === recordId);
  }

  async create(entity: AuditLogEntry): Promise<AuditLogEntry> {
    const now = nowISO();
    const record: AuditLogEntry = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(record);
    return record;
  }
}
