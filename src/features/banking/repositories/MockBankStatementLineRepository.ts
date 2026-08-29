import type { BankStatementLine, ID } from '@/types';
import type { IBankStatementLineRepository } from './IBankStatementLineRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `bsline_${Math.random().toString(36).slice(2, 10)}`;
}

function clone(line: BankStatementLine): BankStatementLine {
  return { ...line, rawSource: { ...line.rawSource } };
}

/** In-memory IBankStatementLineRepository for unit tests. */
export class MockBankStatementLineRepository implements IBankStatementLineRepository {
  private lines: BankStatementLine[];

  constructor(initialData: BankStatementLine[] = []) {
    this.lines = initialData.map(clone);
  }

  async createMany(lines: BankStatementLine[]): Promise<BankStatementLine[]> {
    const now = nowISO();
    const created = lines.map((line) => ({
      ...clone(line),
      id: line.id || generateId(),
      createdAt: now,
      updatedAt: now,
    }));
    this.lines.push(...created);
    return created.map(clone);
  }

  async getByStatement(bankStatementId: ID): Promise<BankStatementLine[]> {
    return this.lines
      .filter((l) => l.bankStatementId === bankStatementId)
      .sort((a, b) => a.sequence - b.sequence)
      .map(clone);
  }

  async getByAccountInWindow(bankAccountId: ID, from: string, to: string): Promise<BankStatementLine[]> {
    return this.lines
      .filter((l) => l.bankAccountId === bankAccountId && l.txnDate >= from && l.txnDate <= to)
      .sort((a, b) => a.txnDate.localeCompare(b.txnDate))
      .map(clone);
  }

  async update(id: ID, patch: Partial<BankStatementLine>): Promise<BankStatementLine> {
    const index = this.lines.findIndex((l) => l.id === id);
    if (index === -1) throw new Error(`MockBankStatementLineRepository: line "${id}" not found`);
    const updated: BankStatementLine = {
      ...this.lines[index],
      ...patch,
      id: this.lines[index].id,
      rawSource: patch.rawSource ? { ...patch.rawSource } : { ...this.lines[index].rawSource },
      updatedAt: nowISO(),
    };
    this.lines[index] = updated;
    return clone(updated);
  }
}
