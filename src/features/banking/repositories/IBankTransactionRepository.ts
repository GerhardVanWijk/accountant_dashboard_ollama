import type { ID } from '@/types';
import type { BankTransactionWithAllocations } from '../types';

/**
 * Bank transaction data-access contract. Unlike the ledger's
 * IJournalEntryRepository, bank transactions ARE editable up until they are
 * cleared by a finalized reconciliation (enforced by BankTransactionService,
 * not this contract) — a mis-allocated split line or a wrong reference
 * needs to be fixable before it clears the bank statement. Every method
 * works in terms of `BankTransactionWithAllocations` (BankTransaction plus
 * its feature-local split-allocation lines) since that is what this module
 * actually persists.
 */
export interface IBankTransactionRepository {
  getAll(): Promise<BankTransactionWithAllocations[]>;
  getById(id: ID): Promise<BankTransactionWithAllocations | undefined>;
  getByAccount(bankAccountId: ID): Promise<BankTransactionWithAllocations[]>;
  create(entity: BankTransactionWithAllocations): Promise<BankTransactionWithAllocations>;
  update(id: ID, patch: Partial<BankTransactionWithAllocations>): Promise<BankTransactionWithAllocations>;
  delete(id: ID): Promise<void>;
}
