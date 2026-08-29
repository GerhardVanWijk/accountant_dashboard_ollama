import type { ID } from '@/types';
import type { BankStatement } from '@/types';

/**
 * Bank-statement data-access contract (migration 0020, `bank_statements`
 * table). A first-class imported statement — the persistent identity a batch
 * of `BankStatementLine` rows belongs to. Mutable CRUD: `importStatus` /
 * `reconciliationStatus` are a real lifecycle the statement moves through,
 * not append-only history (unlike `reconciliations`). `company_id` is
 * resolved server-side at `create()` — `BankStatement` carries no companyId
 * field, the same single-tenant pattern as every other repository here.
 */
export interface IBankStatementRepository {
  create(entity: BankStatement): Promise<BankStatement>;
  getById(id: ID): Promise<BankStatement | undefined>;
  getByAccount(bankAccountId: ID): Promise<BankStatement[]>;
  getByCompany(): Promise<BankStatement[]>;
  update(id: ID, patch: Partial<BankStatement>): Promise<BankStatement>;
  /**
   * Looks up an already-imported statement by its content hash — the dedup
   * key that stops the same file being imported twice. Scoped to one
   * account within the resolved company.
   */
  findByContentHash(bankAccountId: ID, hash: string): Promise<BankStatement | undefined>;
}
