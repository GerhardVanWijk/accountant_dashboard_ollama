import type { ID, ReconciliationIssue } from '@/types';
import type { AuditLogService } from '@/services/auditLogService';
import type { IReconciliationIssueRepository } from '../repositories/IReconciliationIssueRepository';

/**
 * Every resolution action here changes ONLY the ReconciliationIssue's own
 * status — never posted accounting history, never a silent balancing
 * entry. Correcting the underlying cause (a wrong amount, a missing bank
 * charge, a VAT error) always means the user goes through the real,
 * already-existing accounting flow (Banking's Direct Payment/Receipt form,
 * a credit note, journalEntryService.reverseJournalEntry()) and THEN calls
 * resolveIssue() to record that it was done — this service has no method
 * that itself creates or edits a JournalEntry or BankTransaction, by
 * design (per the spec's "never silently mutate posted financial history
 * merely to make reconciliation equal zero" rule).
 */
export class ReconciliationIssueResolutionService {
  constructor(
    private readonly issueRepository: IReconciliationIssueRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async reviewIssue(issueId: ID, userId: ID): Promise<ReconciliationIssue> {
    const updated = await this.issueRepository.update(issueId, { status: 'reviewed' });
    await this.auditLog.log({
      userId,
      action: 'reconciliation_issue_reviewed',
      module: 'reconciliationIntelligence',
      recordType: 'ReconciliationIssue',
      recordId: issueId,
      newValue: { status: 'reviewed' },
    });
    return updated;
  }

  /** Marks a candidate cause as not the real explanation. A reason is required — a silent dismissal defeats the whole point of a traceable investigation. */
  async dismissIssue(issueId: ID, userId: ID, reason: string): Promise<ReconciliationIssue> {
    if (!reason.trim()) throw new Error('A reason is required to dismiss a reconciliation issue.');
    const updated = await this.issueRepository.update(issueId, {
      status: 'dismissed',
      resolutionActorUserId: userId,
      resolutionDate: new Date().toISOString(),
      resolutionReason: reason,
    });
    await this.auditLog.log({
      userId,
      action: 'reconciliation_issue_dismissed',
      module: 'reconciliationIntelligence',
      recordType: 'ReconciliationIssue',
      recordId: issueId,
      previousValue: { status: 'open' },
      newValue: { status: 'dismissed' },
      reason,
    });
    return updated;
  }

  /**
   * Only for issues the detector itself flagged autoResolutionSafe (timing
   * differences, confirmed groupings, genuine rounding) — refuses
   * otherwise, since anything else needs a human-confirmed real correction
   * first (see resolveIssue()).
   */
  async markAutoSafe(issueId: ID, userId: ID): Promise<ReconciliationIssue> {
    const issue = await this.issueRepository.getById(issueId);
    if (!issue) throw new Error(`Reconciliation issue "${issueId}" not found.`);
    if (!issue.autoResolutionSafe) {
      throw new Error('This issue requires a real correction before it can be resolved — see resolveIssue().');
    }
    return this.resolveIssue(issueId, userId, `Confirmed: ${issue.explanation}`);
  }

  /** The general path: the user made a real correction elsewhere (a new bank charge entry, a reversal, a credit note) and is recording that this issue is now explained. */
  async resolveIssue(issueId: ID, userId: ID, reason: string): Promise<ReconciliationIssue> {
    if (!reason.trim()) throw new Error('A reason is required to resolve a reconciliation issue.');
    const updated = await this.issueRepository.update(issueId, {
      status: 'resolved',
      resolutionActorUserId: userId,
      resolutionDate: new Date().toISOString(),
      resolutionReason: reason,
    });
    await this.auditLog.log({
      userId,
      action: 'reconciliation_issue_resolved',
      module: 'reconciliationIntelligence',
      recordType: 'ReconciliationIssue',
      recordId: issueId,
      previousValue: { status: 'open' },
      newValue: { status: 'resolved' },
      reason,
    });
    return updated;
  }
}
