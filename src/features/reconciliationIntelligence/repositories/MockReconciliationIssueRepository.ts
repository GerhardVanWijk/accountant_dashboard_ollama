import type { ID, ReconciliationIssue } from '@/types';
import type { IReconciliationIssueRepository } from './IReconciliationIssueRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `rci_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation, mirroring MockFixedAssetRepository.ts's shape. No seed data — every issue is produced by a real investigation run, never fabricated at startup. */
export class MockReconciliationIssueRepository implements IReconciliationIssueRepository {
  private issues: ReconciliationIssue[];

  constructor(initialData: ReconciliationIssue[] = []) {
    this.issues = initialData.map((i) => ({ ...i }));
  }

  async getAll(): Promise<ReconciliationIssue[]> {
    return [...this.issues];
  }

  async getById(id: ID): Promise<ReconciliationIssue | undefined> {
    return this.issues.find((i) => i.id === id);
  }

  async getByAccount(bankAccountId: ID): Promise<ReconciliationIssue[]> {
    return this.issues.filter((i) => i.bankAccountId === bankAccountId);
  }

  async create(entity: ReconciliationIssue): Promise<ReconciliationIssue> {
    const record: ReconciliationIssue = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.issues.push(record);
    return record;
  }

  async update(id: ID, patch: Partial<ReconciliationIssue>): Promise<ReconciliationIssue> {
    const index = this.issues.findIndex((i) => i.id === id);
    if (index === -1) {
      throw new Error(`MockReconciliationIssueRepository: issue "${id}" not found`);
    }
    const updated: ReconciliationIssue = { ...this.issues[index], ...patch, id: this.issues[index].id, updatedAt: nowISO() };
    this.issues[index] = updated;
    return updated;
  }

  async delete(id: ID): Promise<void> {
    this.issues = this.issues.filter((i) => i.id !== id);
  }
}
