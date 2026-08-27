import type { ID, ReconciliationIssue } from '@/types';
import type { IRepository } from '@/repositories/IRepository';

/**
 * Normal mutable CRUD (status transitions — open/reviewed/dismissed/resolved
 * — are a real lifecycle, not append-only history; see
 * ReconciliationIssue's own doc comment for why the durable audit trail
 * lives in the shared AuditLogService instead of requiring this table to be
 * append-only).
 */
export interface IReconciliationIssueRepository extends IRepository<ReconciliationIssue> {
  getByAccount(bankAccountId: ID): Promise<ReconciliationIssue[]>;
}
