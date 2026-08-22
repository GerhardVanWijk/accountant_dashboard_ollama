import { MockFixedAssetRepository } from './MockFixedAssetRepository';
import { MockDepreciationEntryRepository } from './MockDepreciationEntryRepository';
import { MockAssetDisposalRepository } from './MockAssetDisposalRepository';

/**
 * Single shared in-memory repository instances for the whole assets
 * feature — same "one source of truth per entity type for the lifetime of
 * the app session" rationale as src/features/inventory/repositories/instances.ts.
 */
export const fixedAssetRepository = new MockFixedAssetRepository();
export const depreciationEntryRepository = new MockDepreciationEntryRepository();
export const assetDisposalRepository = new MockAssetDisposalRepository();
