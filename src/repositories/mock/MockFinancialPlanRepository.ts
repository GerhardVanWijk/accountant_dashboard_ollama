import type { FinancialPlanLine, FinancialPlanType } from '@/types';
import type { IFinancialPlanRepository } from '../IFinancialPlanRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `fpl_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IFinancialPlanRepository (Part 11). */
export class MockFinancialPlanRepository implements IFinancialPlanRepository {
  private lines: FinancialPlanLine[];

  constructor(initialData: FinancialPlanLine[] = []) {
    this.lines = initialData.map((l) => ({ ...l }));
  }

  async getAll(): Promise<FinancialPlanLine[]> {
    return [...this.lines];
  }

  async getById(id: string): Promise<FinancialPlanLine | undefined> {
    return this.lines.find((l) => l.id === id);
  }

  async getByPlanTypeAndYear(planType: FinancialPlanType, year: number): Promise<FinancialPlanLine[]> {
    return this.lines.filter((l) => l.planType === planType && l.periodYear === year);
  }

  async create(entity: FinancialPlanLine): Promise<FinancialPlanLine> {
    const record: FinancialPlanLine = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.lines.push(record);
    return record;
  }

  async update(id: string, patch: Partial<FinancialPlanLine>): Promise<FinancialPlanLine> {
    const index = this.lines.findIndex((l) => l.id === id);
    if (index === -1) throw new Error(`MockFinancialPlanRepository: plan line "${id}" not found`);
    const updated: FinancialPlanLine = { ...this.lines[index], ...patch, id: this.lines[index].id, updatedAt: nowISO() };
    this.lines[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.lines = this.lines.filter((l) => l.id !== id);
  }
}
