import type { FinancialYear, ID } from '@/types';

/**
 * Financial years are created and can transition open -> closed, but are
 * never deleted once created (docs/SA_ACCOUNTING_MASTER_SPEC.md §36 — no
 * deletion of posted/structural accounting records). No delete() method.
 */
export interface IFinancialYearRepository {
  getAll(): Promise<FinancialYear[]>;
  getById(id: ID): Promise<FinancialYear | undefined>;
  create(entity: FinancialYear): Promise<FinancialYear>;
  update(id: ID, patch: Partial<FinancialYear>): Promise<FinancialYear>;
}
