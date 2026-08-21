import type { BankAccount, ID } from '@/types';

/**
 * Cash & Bank Accounts data-access contract. Accounts are editable (rename,
 * update banking metadata, activate/deactivate) — the same shape as
 * IAccountRepository (Chart of Accounts) in src/features/accounting, not the
 * append-only shape of ledger/reconciliation rows.
 */
export interface IBankAccountRepository {
  getAll(): Promise<BankAccount[]>;
  getById(id: ID): Promise<BankAccount | undefined>;
  create(entity: BankAccount): Promise<BankAccount>;
  update(id: ID, patch: Partial<BankAccount>): Promise<BankAccount>;
  delete(id: ID): Promise<void>;
}
