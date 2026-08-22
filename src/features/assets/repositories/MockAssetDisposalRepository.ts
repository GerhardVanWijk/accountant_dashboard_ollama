import type { AssetDisposal } from '@/types';
import type { IAssetDisposalRepository } from './IAssetDisposalRepository';

function nowISO(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `disp_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory implementation of the append-only disposal ledger. */
export class MockAssetDisposalRepository implements IAssetDisposalRepository {
  private disposals: AssetDisposal[];

  constructor(initialData: AssetDisposal[] = []) {
    this.disposals = initialData.map((d) => ({ ...d }));
  }

  async getAll(): Promise<AssetDisposal[]> {
    return [...this.disposals];
  }

  async getById(id: string): Promise<AssetDisposal | undefined> {
    return this.disposals.find((d) => d.id === id);
  }

  async getByAsset(assetId: string): Promise<AssetDisposal | undefined> {
    return this.disposals.find((d) => d.assetId === assetId);
  }

  async create(entity: AssetDisposal): Promise<AssetDisposal> {
    const record: AssetDisposal = {
      ...entity,
      id: entity.id || generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.disposals.push(record);
    return record;
  }
}
