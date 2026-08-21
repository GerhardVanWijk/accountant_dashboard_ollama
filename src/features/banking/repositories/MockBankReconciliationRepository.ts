import { seedBankReconciliations } from '@/mock-data/bankReconciliations';
import type { BankReconciliation } from '../types';
import type { IBankReconciliationRepository } from './IBankReconciliationRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `recon_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IBankReconciliationRepository. Like
 * MockJournalEntryRepository, this has no update()/delete() — create() is
 * the only write operation, so finalized reconciliation history cannot be
 * mutated even by mistake.
 */
export class MockBankReconciliationRepository implements IBankReconciliationRepository {
  private reconciliations: BankReconciliation[];

  constructor(initialData: BankReconciliation[] = seedBankReconciliations) {
    this.reconciliations = initialData.map((r) => ({ ...r }));
  }

  async getAll(): Promise<BankReconciliation[]> {
    return this.reconciliations.map((r) => ({ ...r }));
  }

  async getById(id: string): Promise<BankReconciliation | undefined> {
    const found = this.reconciliations.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  async getByAccount(bankAccountId: string): Promise<BankReconciliation[]> {
    return this.reconciliations.filter((r) => r.bankAccountId === bankAccountId).map((r) => ({ ...r }));
  }

  async create(entity: BankReconciliation): Promise<BankReconciliation> {
    const now = nowISO();
    const record: BankReconciliation = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.reconciliations.push(record);
    return { ...record };
  }
}
