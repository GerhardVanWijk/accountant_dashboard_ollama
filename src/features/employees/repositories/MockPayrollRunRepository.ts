import type { PayrollRun } from '@/types';
import type { IPayrollRunRepository } from './IPayrollRunRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `pr_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory implementation of IPayrollRunRepository. No seed data —
 * deliberately, same rationale as MockFixedAssetRepository seeding only
 * 'draft' assets: a payroll run reflects a real point-in-time GL posting,
 * so fabricating a 'posted' seed run with no matching JournalEntry would
 * repeat the exact gap Phase 5's VAT reconciliation work found and fixed
 * for seeded Invoices/Bills.
 */
export class MockPayrollRunRepository implements IPayrollRunRepository {
  private runs: PayrollRun[] = [];

  async getAll(): Promise<PayrollRun[]> {
    return this.runs.map((r) => ({ ...r, payslips: [...r.payslips] }));
  }

  async getById(id: string): Promise<PayrollRun | undefined> {
    const found = this.runs.find((r) => r.id === id);
    return found ? { ...found, payslips: [...found.payslips] } : undefined;
  }

  async create(entity: PayrollRun): Promise<PayrollRun> {
    const record: PayrollRun = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.runs.push(record);
    return { ...record, payslips: [...record.payslips] };
  }

  async update(id: string, patch: Partial<PayrollRun>): Promise<PayrollRun> {
    const index = this.runs.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`MockPayrollRunRepository: payroll run "${id}" not found`);
    }
    const updated: PayrollRun = { ...this.runs[index], ...patch, id: this.runs[index].id, updatedAt: nowISO() };
    this.runs[index] = updated;
    return { ...updated, payslips: [...updated.payslips] };
  }

  async delete(id: string): Promise<void> {
    this.runs = this.runs.filter((r) => r.id !== id);
  }
}
