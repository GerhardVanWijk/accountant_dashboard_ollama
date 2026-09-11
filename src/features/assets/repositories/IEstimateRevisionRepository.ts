import type { EstimateRevision, ID } from '@/types';

/**
 * Append-only change-in-estimate history contract — same shape as
 * IDepreciationEntryRepository. No update()/delete(): a revision is
 * authoritative accounting evidence once posted against; a mistake is
 * corrected by a further (superseding) revision, never edited.
 */
export interface IEstimateRevisionRepository {
  getAll(): Promise<EstimateRevision[]>;
  getByAsset(assetId: ID): Promise<EstimateRevision[]>;
  create(entity: EstimateRevision): Promise<EstimateRevision>;
}
