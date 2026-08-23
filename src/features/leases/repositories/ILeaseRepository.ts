import type { LeaseContract } from '@/types/lease';
import type { IRepository } from '@/repositories/IRepository';

/**
 * Lease register contract. Extends the generic IRepository, mirroring
 * IFixedAssetRepository (src/features/assets/repositories/IFixedAssetRepository.ts)
 * — the register itself is fully editable/deletable (subject to
 * leaseService's own draft-only guards), unlike the append-only
 * amortization ledger below.
 */
export type ILeaseRepository = IRepository<LeaseContract>;
