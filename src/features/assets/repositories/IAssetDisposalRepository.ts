import type { AssetDisposal, ID } from '@/types';

/**
 * Append-only disposal ledger contract, same rationale as
 * IDepreciationEntryRepository — a disposal, once posted, is permanent
 * accounting history.
 */
export interface IAssetDisposalRepository {
  getAll(): Promise<AssetDisposal[]>;
  getById(id: ID): Promise<AssetDisposal | undefined>;
  getByAsset(assetId: ID): Promise<AssetDisposal | undefined>;
  create(entity: AssetDisposal): Promise<AssetDisposal>;
}
