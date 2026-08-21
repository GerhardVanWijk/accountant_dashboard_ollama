import type { AccountingPeriod, ID } from '@/types';

/**
 * Accounting periods transition status (open -> closed -> locked, or back
 * via an authorized reopen) but are never deleted once created — same
 * rationale as IFinancialYearRepository. No delete() method.
 */
export interface IAccountingPeriodRepository {
  getAll(): Promise<AccountingPeriod[]>;
  getById(id: ID): Promise<AccountingPeriod | undefined>;
  create(entity: AccountingPeriod): Promise<AccountingPeriod>;
  update(id: ID, patch: Partial<AccountingPeriod>): Promise<AccountingPeriod>;
}
