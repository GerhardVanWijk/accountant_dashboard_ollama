import type { ID } from '@/types';
import type { AuditLogService } from '@/services/auditLogService';
import type { IBankAccountRepository } from '../repositories/IBankAccountRepository';
import type { IBankTransactionRepository } from '../repositories/IBankTransactionRepository';
import type { IBankReconciliationRepository } from '../repositories/IBankReconciliationRepository';
import type { BankReconciliation, BankTransactionWithAllocations } from '../types';
import { round2 } from '../utils/taxCalculations';

/** Half a cent — floating-point rounding tolerance, not a real imbalance. Mirrors JournalEntryService's BALANCE_EPSILON. */
const BALANCE_EPSILON = 0.005;

export interface ReconciliationSummary {
  bankAccountId: ID;
  statementDate: string;
  statementBalance: number;
  glCashbookBalance: number;
  unpresentedPayments: BankTransactionWithAllocations[];
  unpresentedPaymentsTotal: number;
  unclearedDeposits: BankTransactionWithAllocations[];
  unclearedDepositsTotal: number;
  unallocatedItems: BankTransactionWithAllocations[];
  adjustedBankBalance: number;
  /** glCashbookBalance − adjustedBankBalance. 0 means the reconciliation can be finalized. */
  variance: number;
  isBalanced: boolean;
}

function signedAmount(t: BankTransactionWithAllocations): number {
  return t.direction === 'debit' ? t.amount : -t.amount;
}

/**
 * Bank reconciliation workspace logic. `computeSummary` is a pure,
 * unpersisted calculation the UI calls on every checkbox toggle for a
 * real-time variance indicator; `finalizeReconciliation` is the ONLY path
 * that can ever create a BankReconciliation row, and it re-derives the
 * summary itself and throws before writing anything if variance is
 * non-zero — so a non-zero-variance reconciliation cannot be finalized no
 * matter what the UI does or fails to check (docs/HIVE_TASKS.md's Banking
 * entry: "must not allow finalizing a reconciliation with non-zero
 * variance", enforced service-side).
 */
export class BankReconciliationService {
  constructor(
    private readonly reconciliationRepository: IBankReconciliationRepository,
    private readonly bankTransactionRepository: IBankTransactionRepository,
    private readonly bankAccountRepository: IBankAccountRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Standard reconciliation formula: adjusted bank balance = statement
   * balance + uncleared deposits (recorded in the books, not yet on the
   * statement) − unpresented payments (issued, not yet reflected on the
   * statement). That should equal the GL cashbook balance once everything
   * genuinely reconciles; `variance` is the gap between them.
   * `clearedTransactionIds` are the items the user has ticked off THIS
   * session, in addition to whatever is already `status: 'reconciled'`
   * from a prior finalized run.
   */
  async computeSummary(
    bankAccountId: ID,
    statementDate: string,
    statementBalance: number,
    clearedTransactionIds: ID[],
  ): Promise<ReconciliationSummary> {
    const account = await this.bankAccountRepository.getById(bankAccountId);
    if (!account) throw new Error(`Bank account "${bankAccountId}" not found.`);

    const allTxns = await this.bankTransactionRepository.getByAccount(bankAccountId);
    const upToStatementDate = allTxns.filter((t) => t.date <= statementDate);

    const glCashbookBalance = round2(
      account.openingBalance + upToStatementDate.reduce((sum, t) => sum + signedAmount(t), 0),
    );

    const clearedSet = new Set(clearedTransactionIds);
    const outstanding = upToStatementDate.filter((t) => t.status !== 'reconciled' && !clearedSet.has(t.id));

    // Unallocated check covers BOTH still-outstanding items (informational —
    // the user needs to allocate before they can even select them) AND
    // items the user just ticked as cleared this session (a hard block —
    // those are about to become 'reconciled', so they must already carry a
    // real GL split). Transfers don't need a GL split at all (a direct
    // account-to-account movement, no revenue/expense line).
    const notYetReconciled = upToStatementDate.filter((t) => t.status !== 'reconciled');
    const unallocatedItems = notYetReconciled.filter((t) => t.allocations.length === 0 && !t.transferPairId);
    const unpresentedPayments = outstanding.filter((t) => t.direction === 'credit');
    const unclearedDeposits = outstanding.filter((t) => t.direction === 'debit');

    const unpresentedPaymentsTotal = round2(unpresentedPayments.reduce((sum, t) => sum + t.amount, 0));
    const unclearedDepositsTotal = round2(unclearedDeposits.reduce((sum, t) => sum + t.amount, 0));

    const adjustedBankBalance = round2(statementBalance + unclearedDepositsTotal - unpresentedPaymentsTotal);
    const variance = round2(glCashbookBalance - adjustedBankBalance);

    return {
      bankAccountId,
      statementDate,
      statementBalance,
      glCashbookBalance,
      unpresentedPayments,
      unpresentedPaymentsTotal,
      unclearedDeposits,
      unclearedDepositsTotal,
      unallocatedItems,
      adjustedBankBalance,
      variance,
      isBalanced: Math.abs(variance) <= BALANCE_EPSILON,
    };
  }

  /**
   * Creates the immutable BankReconciliation snapshot and marks every
   * cleared transaction `status: 'reconciled'`. Throws — and writes
   * nothing at all — if the variance is non-zero, or if any outstanding
   * item still needs a GL allocation.
   */
  async finalizeReconciliation(
    bankAccountId: ID,
    statementDate: string,
    statementBalance: number,
    clearedTransactionIds: ID[],
    userId: ID,
    notes?: string,
  ): Promise<BankReconciliation> {
    const summary = await this.computeSummary(bankAccountId, statementDate, statementBalance, clearedTransactionIds);

    if (!summary.isBalanced) {
      throw new Error(
        `Cannot finalize: reconciliation is out of balance by ${summary.variance.toFixed(2)}. ` +
          'The bank statement balance and GL cashbook balance must match exactly before finalizing.',
      );
    }
    if (summary.unallocatedItems.length > 0) {
      throw new Error(
        `Cannot finalize: ${summary.unallocatedItems.length} transaction(s) still need a GL allocation before they can be cleared.`,
      );
    }
    if (clearedTransactionIds.length === 0) {
      throw new Error('Cannot finalize: select at least one transaction as cleared.');
    }

    for (const id of clearedTransactionIds) {
      await this.bankTransactionRepository.update(id, { status: 'reconciled' });
    }

    const record = await this.reconciliationRepository.create({
      id: '',
      bankAccountId,
      statementDate,
      statementBalance,
      glCashbookBalance: summary.glCashbookBalance,
      adjustedBankBalance: summary.adjustedBankBalance,
      variance: summary.variance,
      clearedTransactionIds,
      unpresentedTransactionIds: summary.unpresentedPayments.map((t) => t.id),
      unclearedDepositIds: summary.unclearedDeposits.map((t) => t.id),
      finalizedAt: new Date().toISOString(),
      finalizedByUserId: userId,
      notes,
      createdAt: '',
      updatedAt: '',
    });

    for (const id of clearedTransactionIds) {
      await this.bankTransactionRepository.update(id, { reconciliationId: record.id });
    }

    await this.auditLog.log({
      userId,
      action: 'bank_reconciled',
      module: 'banking',
      recordType: 'BankReconciliation',
      recordId: record.id,
      newValue: record,
    });

    return record;
  }

  /** Immutable reconciliation history for one bank account, newest first. */
  async getHistory(bankAccountId: ID): Promise<BankReconciliation[]> {
    const history = await this.reconciliationRepository.getByAccount(bankAccountId);
    return [...history].sort((a, b) => b.statementDate.localeCompare(a.statementDate));
  }
}
