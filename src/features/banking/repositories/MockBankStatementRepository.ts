import type { BankStatement, ID } from '@/types';
import type { IBankStatementRepository } from './IBankStatementRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `bstmt_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory IBankStatementRepository for unit tests — never touches a live client. */
export class MockBankStatementRepository implements IBankStatementRepository {
  private statements: BankStatement[];

  constructor(initialData: BankStatement[] = []) {
    this.statements = initialData.map((s) => ({ ...s }));
  }

  async create(entity: BankStatement): Promise<BankStatement> {
    const now = nowISO();
    const record: BankStatement = { ...entity, id: entity.id || generateId(), createdAt: now, updatedAt: now };
    this.statements.push(record);
    return { ...record };
  }

  async getById(id: ID): Promise<BankStatement | undefined> {
    const found = this.statements.find((s) => s.id === id);
    return found ? { ...found } : undefined;
  }

  async getByAccount(bankAccountId: ID): Promise<BankStatement[]> {
    return this.statements.filter((s) => s.bankAccountId === bankAccountId).map((s) => ({ ...s }));
  }

  async getByCompany(): Promise<BankStatement[]> {
    return this.statements.map((s) => ({ ...s }));
  }

  async update(id: ID, patch: Partial<BankStatement>): Promise<BankStatement> {
    const index = this.statements.findIndex((s) => s.id === id);
    if (index === -1) throw new Error(`MockBankStatementRepository: statement "${id}" not found`);
    const updated: BankStatement = { ...this.statements[index], ...patch, id: this.statements[index].id, updatedAt: nowISO() };
    this.statements[index] = updated;
    return { ...updated };
  }

  async findByContentHash(bankAccountId: ID, hash: string): Promise<BankStatement | undefined> {
    const found = this.statements.find((s) => s.bankAccountId === bankAccountId && s.contentHash === hash);
    return found ? { ...found } : undefined;
  }
}
