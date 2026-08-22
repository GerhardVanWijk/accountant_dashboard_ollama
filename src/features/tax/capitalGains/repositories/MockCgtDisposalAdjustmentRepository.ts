import type { CgtDisposalAdjustment } from '@/types';
import type { ICgtDisposalAdjustmentRepository } from './ICgtDisposalAdjustmentRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `cgt_adj_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of ICgtDisposalAdjustmentRepository. One
 * record per disposalId at most — CapitalGainsService.setSellingCosts()
 * upserts rather than appending, since this is a user-editable override,
 * not an append-only ledger.
 */
export class MockCgtDisposalAdjustmentRepository implements ICgtDisposalAdjustmentRepository {
  private adjustments: CgtDisposalAdjustment[];

  constructor(initialData: CgtDisposalAdjustment[] = []) {
    this.adjustments = initialData.map((a) => ({ ...a }));
  }

  async getAll(): Promise<CgtDisposalAdjustment[]> {
    return [...this.adjustments];
  }

  async getById(id: string): Promise<CgtDisposalAdjustment | undefined> {
    return this.adjustments.find((a) => a.id === id);
  }

  async getByDisposal(disposalId: string): Promise<CgtDisposalAdjustment | undefined> {
    return this.adjustments.find((a) => a.disposalId === disposalId);
  }

  async create(entity: CgtDisposalAdjustment): Promise<CgtDisposalAdjustment> {
    const record: CgtDisposalAdjustment = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.adjustments.push(record);
    return record;
  }

  async update(id: string, patch: Partial<CgtDisposalAdjustment>): Promise<CgtDisposalAdjustment> {
    const index = this.adjustments.findIndex((a) => a.id === id);
    if (index === -1) {
      throw new Error(`MockCgtDisposalAdjustmentRepository: adjustment "${id}" not found`);
    }
    const updated: CgtDisposalAdjustment = { ...this.adjustments[index], ...patch, id: this.adjustments[index].id, updatedAt: nowISO() };
    this.adjustments[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.adjustments = this.adjustments.filter((a) => a.id !== id);
  }
}
