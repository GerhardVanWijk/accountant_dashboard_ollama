import type { FixedAsset } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/**
 * Fixed asset register contract. Extends the generic IRepository, mirroring
 * IProductRepository (src/features/inventory/repositories/IProductRepository.ts)
 * — the register itself is fully editable/deletable (subject to
 * fixedAssetService's own draft-only guards), unlike the append-only
 * ledgers below.
 */
export type IFixedAssetRepository = IRepository<FixedAsset>;
