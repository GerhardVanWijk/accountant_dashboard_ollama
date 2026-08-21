import type { ID } from '@/types';
import type { BankReconciliation } from '../types';

/**
 * Append-only reconciliation-history contract — deliberately NARROWER than
 * a generic CRUD repository, the same shape as IJournalEntryRepository
 * (docs/LEDGER_ARCHITECTURE.md). A finalized BankReconciliation is a
 * tamper-evident snapshot: no update()/delete() at all, so nothing can
 * mutate reconciliation history after the fact. Only
 * BankReconciliationService.finalizeReconciliation() ever calls create(),
 * and only once its zero-variance check has passed.
 */
export interface IBankReconciliationRepository {
  getAll(): Promise<BankReconciliation[]>;
  getById(id: ID): Promise<BankReconciliation | undefined>;
  getByAccount(bankAccountId: ID): Promise<BankReconciliation[]>;
  create(entity: BankReconciliation): Promise<BankReconciliation>;
}
