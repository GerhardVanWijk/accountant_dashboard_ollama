import type { DepreciationEntry, ID } from '@/types';

/**
 * Append-only depreciation ledger contract — deliberately narrower than
 * the generic IRepository<T>, mirroring IStockMovementRepository
 * (src/features/inventory/repositories/IStockMovementRepository.ts). No
 * update()/delete(): a past depreciation run can never be edited, only
 * superseded by a later real-world correction (a reversing journal entry
 * posted through journalEntryService, same as everywhere else in this
 * codebase — see docs/LEDGER_ARCHITECTURE.md).
 */
export interface IDepreciationEntryRepository {
  getAll(): Promise<DepreciationEntry[]>;
  getById(id: ID): Promise<DepreciationEntry | undefined>;
  getByAsset(assetId: ID): Promise<DepreciationEntry[]>;
  create(entity: DepreciationEntry): Promise<DepreciationEntry>;
}
