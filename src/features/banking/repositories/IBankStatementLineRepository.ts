import type { ID } from '@/types';
import type { BankStatementLine } from '@/types';

/**
 * Bank-statement-line data-access contract (migration 0020,
 * `bank_statement_lines` table). Lines are created in bulk with their parent
 * statement and then only ever patched on the matching path
 * (`lineState` / `matchedBankTransactionId`). `company_id` is resolved
 * server-side at `createMany()`.
 */
export interface IBankStatementLineRepository {
  createMany(lines: BankStatementLine[]): Promise<BankStatementLine[]>;
  getByStatement(bankStatementId: ID): Promise<BankStatementLine[]>;
  /**
   * Every line for an account whose `txnDate` falls in `[from, to]`
   * (inclusive ISO bounds) — the bank side for a reconciliation window,
   * across whatever statements cover it.
   */
  getByAccountInWindow(bankAccountId: ID, from: string, to: string): Promise<BankStatementLine[]>;
  update(id: ID, patch: Partial<BankStatementLine>): Promise<BankStatementLine>;
}
