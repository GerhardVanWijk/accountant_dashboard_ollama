import type { Account, ID } from '@/types';

/**
 * Chart of Accounts data-access contract. Unlike JournalEntry rows, Account
 * rows ARE editable (rename, re-parent, activate/deactivate) — the ledger
 * lines that reference an account are what must stay immutable, not the
 * account record itself. See IJournalEntryRepository for the append-only
 * contract and docs/LEDGER_ARCHITECTURE.md for the rationale.
 */
export interface IAccountRepository {
  getAll(): Promise<Account[]>;
  getById(id: ID): Promise<Account | undefined>;
  create(entity: Account): Promise<Account>;
  update(id: ID, patch: Partial<Account>): Promise<Account>;
  delete(id: ID): Promise<void>;
}
