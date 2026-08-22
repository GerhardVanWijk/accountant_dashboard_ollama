import type { DividendDeclaration } from '@/types';
import type { IDividendDeclarationRepository } from './IDividendDeclarationRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `divd_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IDividendDeclarationRepository, mirroring MockFixedAssetRepository.ts's shape. */
export class MockDividendDeclarationRepository implements IDividendDeclarationRepository {
  private declarations: DividendDeclaration[];

  constructor(initialData: DividendDeclaration[] = []) {
    this.declarations = initialData.map((d) => ({ ...d }));
  }

  async getAll(): Promise<DividendDeclaration[]> {
    return [...this.declarations];
  }

  async getById(id: string): Promise<DividendDeclaration | undefined> {
    return this.declarations.find((d) => d.id === id);
  }

  async create(entity: DividendDeclaration): Promise<DividendDeclaration> {
    const record: DividendDeclaration = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.declarations.push(record);
    return record;
  }

  async update(id: string, patch: Partial<DividendDeclaration>): Promise<DividendDeclaration> {
    const index = this.declarations.findIndex((d) => d.id === id);
    if (index === -1) {
      throw new Error(`MockDividendDeclarationRepository: declaration "${id}" not found`);
    }
    const updated: DividendDeclaration = { ...this.declarations[index], ...patch, id: this.declarations[index].id, updatedAt: nowISO() };
    this.declarations[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.declarations = this.declarations.filter((d) => d.id !== id);
  }
}
