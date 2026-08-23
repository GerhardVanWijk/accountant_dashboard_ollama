import type { ID, PublicInterestScore } from '@/types';

/**
 * Append-only — same narrow shape as `IJournalEntryRepository`/
 * `IAuditLogRepository` (no update()/delete()). A Public Interest Score is a
 * historical compliance record (SA_ACCOUNTING_MASTER_SPEC.md §3: "retain
 * historical scores"); a re-calculation creates a new row rather than
 * overwriting the last one.
 */
export interface IPublicInterestScoreRepository {
  getAll(): Promise<PublicInterestScore[]>;
  getById(id: ID): Promise<PublicInterestScore | undefined>;
  getByCompany(companyId: ID): Promise<PublicInterestScore[]>;
  create(entity: PublicInterestScore): Promise<PublicInterestScore>;
}
