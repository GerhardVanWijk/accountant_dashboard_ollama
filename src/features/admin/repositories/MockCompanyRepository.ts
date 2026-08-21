import type { Company } from '@/types';
import { seedCompanies } from '@/mock-data/companies';
import type { ICompanyRepository } from './ICompanyRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `comp_${Math.random().toString(36).slice(2, 10)}`;
}

export class MockCompanyRepository implements ICompanyRepository {
  private companies: Company[];

  constructor(initialData: Company[] = seedCompanies) {
    this.companies = initialData.map((c) => ({ ...c }));
  }

  async getAll(): Promise<Company[]> {
    return [...this.companies];
  }

  async getById(id: string): Promise<Company | undefined> {
    return this.companies.find((c) => c.id === id);
  }

  async create(entity: Company): Promise<Company> {
    const record: Company = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.companies.push(record);
    return record;
  }

  async update(id: string, patch: Partial<Company>): Promise<Company> {
    const index = this.companies.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`MockCompanyRepository: company "${id}" not found`);
    }
    const updated: Company = {
      ...this.companies[index],
      ...patch,
      id: this.companies[index].id,
      updatedAt: nowISO(),
    };
    this.companies[index] = updated;
    return updated;
  }
}
