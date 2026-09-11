import type { EstimateRevision } from '@/types';
import type { IEstimateRevisionRepository } from './IEstimateRevisionRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `rev_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory append-only change-in-estimate history. Like
 * MockDepreciationEntryRepository — create() is the only write path.
 */
export class MockEstimateRevisionRepository implements IEstimateRevisionRepository {
  private revisions: EstimateRevision[];

  constructor(initialData: EstimateRevision[] = []) {
    this.revisions = initialData.map((r) => ({ ...r }));
  }

  async getAll(): Promise<EstimateRevision[]> {
    return this.revisions.map((r) => ({ ...r })).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }

  async getByAsset(assetId: string): Promise<EstimateRevision[]> {
    return (await this.getAll()).filter((r) => r.assetId === assetId);
  }

  async create(entity: EstimateRevision): Promise<EstimateRevision> {
    const record: EstimateRevision = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.revisions.push(record);
    return { ...record };
  }
}
