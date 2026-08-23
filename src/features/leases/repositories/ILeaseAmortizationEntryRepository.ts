import type { ID } from '@/types/common';
import type { LeaseAmortizationEntry } from '@/types/lease';

/**
 * Append-only lease amortization ledger contract — deliberately narrower
 * than the generic IRepository<T>, mirroring IDepreciationEntryRepository
 * (src/features/assets/repositories/IDepreciationEntryRepository.ts).
 * No update()/delete(): a past amortization run can never be edited, only
 * superseded by a later real-world correction (a reversing journal entry
 * posted through journalEntryService, same as everywhere else in this
 * codebase — see docs/LEDGER_ARCHITECTURE.md).
 */
export interface ILeaseAmortizationEntryRepository {
  getAll(): Promise<LeaseAmortizationEntry[]>;
  getById(id: ID): Promise<LeaseAmortizationEntry | undefined>;
  getByLease(leaseId: ID): Promise<LeaseAmortizationEntry[]>;
  create(entity: LeaseAmortizationEntry): Promise<LeaseAmortizationEntry>;
}
