import type { ID, ReportingStandardVersion } from '@/types';
import type { IReportingStandardVersionRepository } from './IReportingStandardVersionRepository';
import { seedReportingStandardVersions } from '@/mock-data/reportingStandardVersions';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `rsv_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of IReportingStandardVersionRepository, seeded with the real editions/effective dates from src/mock-data/reportingStandardVersions.ts. */
export class MockReportingStandardVersionRepository implements IReportingStandardVersionRepository {
  private versions: ReportingStandardVersion[];

  constructor(initialData: ReportingStandardVersion[] = seedReportingStandardVersions) {
    this.versions = initialData.map((v) => ({ ...v }));
  }

  async getAll(): Promise<ReportingStandardVersion[]> {
    return this.versions.map((v) => ({ ...v }));
  }

  async getById(id: ID): Promise<ReportingStandardVersion | undefined> {
    const found = this.versions.find((v) => v.id === id);
    return found ? { ...found } : undefined;
  }

  async create(entity: ReportingStandardVersion): Promise<ReportingStandardVersion> {
    const record: ReportingStandardVersion = { ...entity, id: entity.id || generateId(), createdAt: nowISO(), updatedAt: nowISO() };
    this.versions.push(record);
    return record;
  }

  async update(id: ID, patch: Partial<ReportingStandardVersion>): Promise<ReportingStandardVersion> {
    const index = this.versions.findIndex((v) => v.id === id);
    if (index === -1) {
      throw new Error(`MockReportingStandardVersionRepository: version "${id}" not found`);
    }
    const updated: ReportingStandardVersion = { ...this.versions[index], ...patch, id: this.versions[index].id, updatedAt: nowISO() };
    this.versions[index] = updated;
    return updated;
  }

  async delete(id: ID): Promise<void> {
    this.versions = this.versions.filter((v) => v.id !== id);
  }
}
