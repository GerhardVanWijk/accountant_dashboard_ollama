import { describe, expect, it } from 'vitest';
import { ReconciliationIssueResolutionService } from './reconciliationIssueResolutionService';
import { MockReconciliationIssueRepository } from '../repositories/MockReconciliationIssueRepository';
import { AuditLogService } from '@/services/auditLogService';
import type { IAuditLogRepository } from '@/repositories/IAuditLogRepository';
import type { AuditLogEntry, ID, ReconciliationIssue } from '@/types';

class InMemoryAuditLogRepository implements IAuditLogRepository {
  entries: AuditLogEntry[] = [];
  async getAll() {
    return this.entries;
  }
  async getById(id: ID) {
    return this.entries.find((e) => e.id === id);
  }
  async getByRecord(recordType: string, recordId: ID) {
    return this.entries.filter((e) => e.recordType === recordType && e.recordId === recordId);
  }
  async create(entity: AuditLogEntry) {
    const record = { ...entity, id: entity.id || `al_${this.entries.length + 1}` };
    this.entries.push(record);
    return record;
  }
}

function draftIssue(overrides: Partial<ReconciliationIssue> = {}): ReconciliationIssue {
  return {
    id: '',
    createdAt: '',
    updatedAt: '',
    bankAccountId: 'acc1',
    statementDate: '2026-08-27',
    issueType: 'amount_mismatch',
    severity: 'medium',
    confidence: 80,
    effectAmount: 16.73,
    relatedBankTransactionIds: [],
    relatedJournalEntryIds: [],
    relatedSourceDocumentIds: [],
    explanation: 'Test issue',
    evidence: [],
    suggestedResolution: 'Review',
    autoResolutionSafe: false,
    status: 'open',
    ...overrides,
  };
}

async function buildFixture() {
  const issueRepository = new MockReconciliationIssueRepository();
  const auditRepository = new InMemoryAuditLogRepository();
  const auditLog = new AuditLogService(auditRepository);
  const service = new ReconciliationIssueResolutionService(issueRepository, auditLog);
  const issue = await issueRepository.create(draftIssue());
  return { service, issueRepository, auditRepository, issue };
}

describe('ReconciliationIssueResolutionService', () => {
  it('dismisses a false-positive candidate with a required reason', async () => {
    const { service, issue } = await buildFixture();

    const updated = await service.dismissIssue(issue.id, 'user1', 'Confirmed this is unrelated — different supplier entirely.');

    expect(updated.status).toBe('dismissed');
    expect(updated.resolutionReason).toBeTruthy();
  });

  it('refuses to dismiss without a reason', async () => {
    const { service, issue } = await buildFixture();
    await expect(service.dismissIssue(issue.id, 'user1', '   ')).rejects.toThrow();
  });

  it('a resolved issue retains audit history — the audit log records the resolution', async () => {
    const { service, auditRepository, issue } = await buildFixture();

    await service.resolveIssue(issue.id, 'user1', 'Corrected the bank charge allocation and re-posted.');

    const logged = auditRepository.entries.filter((e) => e.recordId === issue.id && e.action === 'reconciliation_issue_resolved');
    expect(logged).toHaveLength(1);
    expect(logged[0].reason).toContain('Corrected the bank charge');
  });

  it('markAutoSafe refuses an issue that is not flagged auto-resolution-safe', async () => {
    const { service, issue } = await buildFixture();
    await expect(service.markAutoSafe(issue.id, 'user1')).rejects.toThrow(/requires a real correction/);
  });

  it('markAutoSafe resolves an issue the detector flagged as safe', async () => {
    const { service, issueRepository } = await buildFixture();
    const safeIssue = await issueRepository.create(draftIssue({ id: '', autoResolutionSafe: true, issueType: 'date_offset_timing' }));

    const updated = await service.markAutoSafe(safeIssue.id, 'user1');

    expect(updated.status).toBe('resolved');
  });
});
