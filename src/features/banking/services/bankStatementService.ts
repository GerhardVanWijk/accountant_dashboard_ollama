import type { BankStatement, BankStatementLine, ID } from '@/types';
import type { IBankStatementRepository } from '../repositories/IBankStatementRepository';
import type { IBankStatementLineRepository } from '../repositories/IBankStatementLineRepository';

/**
 * Read side of the persisted bank-statement model (migration 0020). The
 * write path — parsing a file into one `BankStatement` + its
 * `BankStatementLine` rows — is `StatementImportService`; this service only
 * ever reads, so the side-by-side reconciliation workspace (P2.2) can scope
 * itself to a chosen statement without touching the import/GL machinery.
 *
 * Statements are returned newest period first so a selector defaults to the
 * most recent one.
 */
export class BankStatementService {
  constructor(
    private readonly statementRepository: IBankStatementRepository,
    private readonly lineRepository: IBankStatementLineRepository,
  ) {}

  async getStatements(bankAccountId: ID): Promise<BankStatement[]> {
    const statements = await this.statementRepository.getByAccount(bankAccountId);
    return [...statements].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.createdAt.localeCompare(a.createdAt));
  }

  async getStatement(statementId: ID): Promise<BankStatement | undefined> {
    return this.statementRepository.getById(statementId);
  }

  async getLines(statementId: ID): Promise<BankStatementLine[]> {
    const lines = await this.lineRepository.getByStatement(statementId);
    return [...lines].sort((a, b) => a.sequence - b.sequence);
  }

  /** Every line for an account whose `txnDate` falls in `[from, to]` — the bank side of a reconciliation window across whatever statements cover it. */
  async getLinesInWindow(bankAccountId: ID, from: string, to: string): Promise<BankStatementLine[]> {
    return this.lineRepository.getByAccountInWindow(bankAccountId, from, to);
  }

  /** The statement + its lines in one call — what `useReconciliationStatement` consumes. */
  async getStatementWithLines(statementId: ID): Promise<{ statement: BankStatement; lines: BankStatementLine[] } | undefined> {
    const statement = await this.statementRepository.getById(statementId);
    if (!statement) return undefined;
    const lines = await this.getLines(statementId);
    return { statement, lines };
  }
}
