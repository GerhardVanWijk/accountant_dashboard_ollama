import type { AccountingPeriod, AccountingPeriodStatus, ID, ISODateString } from '@/types';
import type { IAccountingPeriodRepository } from '../repositories/IAccountingPeriodRepository';
import { findPeriodForDate } from '../utils/periodLookup';
import type { AuditLogService } from '@/services/auditLogService';

/**
 * Accounting period lifecycle (docs/SA_ACCOUNTING_MASTER_SPEC.md §35/§68).
 * Every status transition is written to the audit trail — closing/locking/
 * reopening a period is exactly the kind of material accounting action §37
 * requires logging, and reopening specifically requires a reason per §35
 * ("An authorized reopening must record: user, date/time, reason, old
 * status, new status"). AuditLogService is injected (not imported as the
 * top-level singleton) so tests can pass a fresh instance instead of
 * sharing global mutable state between test runs.
 */
export class AccountingPeriodService {
  constructor(
    private readonly repository: IAccountingPeriodRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async getPeriods(): Promise<AccountingPeriod[]> {
    return this.repository.getAll();
  }

  async getPeriod(id: ID): Promise<AccountingPeriod | undefined> {
    return this.repository.getById(id);
  }

  /** The period containing `date`, or undefined if none is defined for it. */
  async getPeriodForDate(date: ISODateString): Promise<AccountingPeriod | undefined> {
    const periods = await this.repository.getAll();
    return findPeriodForDate(periods, date);
  }

  /**
   * True only if a period exists for `date` AND its status is 'open'.
   * JournalEntryService.postJournalEntry() calls this before writing
   * anything — see docs/LEDGER_ARCHITECTURE.md § Accounting periods.
   */
  async isDateOpenForPosting(date: ISODateString): Promise<boolean> {
    const period = await this.getPeriodForDate(date);
    return period?.status === 'open';
  }

  private async transition(
    periodId: ID,
    newStatus: AccountingPeriodStatus,
    userId: ID,
    action: 'period_closed' | 'period_reopened',
    reason?: string,
  ): Promise<AccountingPeriod> {
    const period = await this.repository.getById(periodId);
    if (!period) {
      throw new Error(`Accounting period "${periodId}" not found.`);
    }
    const previousStatus = period.status;
    const updated = await this.repository.update(periodId, { status: newStatus });

    await this.auditLog.log({
      userId,
      action,
      module: 'accounting',
      recordType: 'AccountingPeriod',
      recordId: periodId,
      previousValue: { status: previousStatus },
      newValue: { status: newStatus },
      reason,
    });

    return updated;
  }

  async closePeriod(periodId: ID, userId: ID): Promise<AccountingPeriod> {
    return this.transition(periodId, 'closed', userId, 'period_closed');
  }

  async lockPeriod(periodId: ID, userId: ID): Promise<AccountingPeriod> {
    return this.transition(periodId, 'locked', userId, 'period_closed');
  }

  /** Reopening ALWAYS requires a reason — enforced here, not left to the caller's discipline. */
  async reopenPeriod(periodId: ID, userId: ID, reason: string): Promise<AccountingPeriod> {
    if (!reason || !reason.trim()) {
      throw new Error('Reopening an accounting period requires a reason.');
    }
    return this.transition(periodId, 'open', userId, 'period_reopened', reason);
  }
}
