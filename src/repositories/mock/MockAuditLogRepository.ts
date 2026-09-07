import type { AuditLogEntry } from '@/types';
import type { AuditLogPage, AuditLogPageQuery, IAuditLogRepository } from '../IAuditLogRepository';

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

  async getPage(query: AuditLogPageQuery): Promise<AuditLogPage> {
    const term = query.search?.trim().toLowerCase();
    const matched = this.entries
      .filter((e) => {
        if (query.module && e.module !== query.module) return false;
        if (query.action && e.action !== query.action) return false;
        if (query.actions?.length && !query.actions.includes(e.action)) return false;
        if (query.userId && e.userId !== query.userId) return false;
        if (query.recordType && e.recordType !== query.recordType) return false;
        if (query.from && e.createdAt < query.from) return false;
        if (query.to && e.createdAt > query.to) return false;
        if (term && !`${e.recordId} ${e.reason ?? ''}`.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = query.page * query.pageSize;
    return { rows: matched.slice(start, start + query.pageSize), total: matched.length };
  }

  async create(entity: AuditLogEntry): Promise<AuditLogEntry> {
    const now = nowISO();
    const record: AuditLogEntry = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: entity.createdAt || now,
      updatedAt: entity.updatedAt || now,
    };
    this.entries.push(record);
    return record;
  }
}
