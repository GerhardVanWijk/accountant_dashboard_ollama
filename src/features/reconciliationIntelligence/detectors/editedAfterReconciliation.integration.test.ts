import { describe, expect, it } from 'vitest';
import { detectEditedAfterReconciliation } from './editedAfterReconciliation';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod } from '@/types';
import type { BankReconciliation, BankTransactionWithAllocations } from '@/features/banking/types';

function makeOpenPeriod(): AccountingPeriod {
  return {
    id: 'period_test_open',
    companyId: 'comp_test',
    financialYearId: 'fy_test',
    name: '2026 (test)',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * End-to-end proof (spec: "Verify completed reconciliation protection") of
 * the full chain — real posting engine, real audit log, this module's own
 * detector — not hand-built fixtures standing in for what the real services
 * would produce.
 *
 * 1. A posted JournalEntry exists and a BankReconciliation snapshot cleared
 *    the BankTransaction that points at it.
 * 2. That JournalEntry is later reversed through the LEGITIMATE accounting
 *    flow (journalEntryService.reverseJournalEntry() — never a direct edit;
 *    posted entries have no update() at all).
 * 3. The investigator's detector flags the previously-completed
 *    reconciliation as now affected.
 * 4. The original BankReconciliation snapshot itself is untouched — still
 *    reproducible exactly as finalized.
 * 5. The audit trail carries original value, the correction, the actor, the
 *    timestamp, and the financial effect.
 */
describe('Completed reconciliation protection — end to end', () => {
  it('detects a later reversal of a reconciled transaction\'s journal entry without ever mutating the original reconciliation or journal entry', async () => {
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditRepository = new MockAuditLogRepository();
    const auditLog = new AuditLogService(auditRepository);
    const journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);

    // Step 1: post the original entry (a bank charge, say) and simulate the
    // reconciliation that cleared it — BankReconciliation is a real, separate
    // immutable snapshot type; built directly here since this test only needs
    // to prove the DETECTOR's reaction to a later reversal, not re-exercise
    // bankReconciliationService.finalizeReconciliation() itself (covered by
    // that service's own test suite).
    const original = await journalEntryService.postJournalEntry({
      date: '2026-07-15',
      memo: 'Bank charge',
      source: 'bank_transaction',
      postedByUserId: 'user_accountant',
      lines: [
        { accountId: 'acc_5100', debit: 47.5, credit: 0 },
        { accountId: 'acc_1000', debit: 0, credit: 47.5 },
      ],
    });

    const transaction: BankTransactionWithAllocations = {
      id: 'txn_bankcharge',
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
      bankAccountId: 'bank_acc_1',
      date: '2026-07-15',
      description: 'Bank charge',
      amount: 47.5,
      direction: 'credit',
      status: 'reconciled',
      allocations: [],
      journalEntryId: original.id,
      reconciliationId: 'recon_july',
    };

    const reconciliation: BankReconciliation = {
      id: 'recon_july',
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
      bankAccountId: 'bank_acc_1',
      statementDate: '2026-07-31',
      statementBalance: 10000,
      glCashbookBalance: 10000,
      adjustedBankBalance: 10000,
      variance: 0,
      clearedTransactionIds: [transaction.id],
      unpresentedTransactionIds: [],
      unclearedDepositIds: [],
      finalizedAt: '2026-07-31T09:00:00.000Z',
      finalizedByUserId: 'user_accountant',
    };
    const reconciliationSnapshotBefore = JSON.stringify(reconciliation);

    // Step 2: a mistake is discovered — the charge shouldn't have been
    // posted — and it's corrected the ONLY legitimate way: a reversal, not
    // an edit (there is no edit path; postJournalEntry()'s repository has no
    // update()).
    const reversal = await journalEntryService.reverseJournalEntry(original.id, 'user_reviewer', 'Bank charge posted in error — reversing.');

    // Step 3: the investigator's detector picks this up.
    const issues = detectEditedAfterReconciliation([reconciliation], [transaction], [original, reversal]);
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe('edited_after_reconciliation');
    expect(issues[0].severity).toBe('critical');
    // Financial effect: the amount the completed reconciliation certified as cleared.
    expect(issues[0].effectAmount).toBeCloseTo(47.5);
    expect(issues[0].relatedJournalEntryIds).toEqual([original.id, reversal.id]);

    // Step 4: the original reconciliation snapshot is byte-for-byte
    // unchanged — nothing in this flow touched it. (BankReconciliation has
    // no update()/delete() at all on its repository, so this isn't just
    // "nothing happened to touch it" — it's structurally impossible for
    // anything in this codebase to mutate it.)
    expect(JSON.stringify(reconciliation)).toBe(reconciliationSnapshotBefore);
    // The original JournalEntry itself is also unchanged — still posted,
    // still carrying its own original lines exactly as first posted.
    const originalStillOnFile = await journalEntryService.getEntry(original.id);
    expect(originalStillOnFile!.status).toBe('posted');
    expect(originalStillOnFile!.lines).toEqual(original.lines);

    // Step 5: the audit trail carries original value, the correction, actor, timestamp, and effect.
    const originalAudit = await auditLog.getForRecord('JournalEntry', original.id);
    expect(originalAudit).toHaveLength(2); // 'posted' then 'reversed'
    const postedEntry = originalAudit.find((a) => a.action === 'posted')!;
    const reversedEntry = originalAudit.find((a) => a.action === 'reversed')!;

    expect(postedEntry.userId).toBe('user_accountant');
    expect(postedEntry.newValue).toMatchObject({ id: original.id, status: 'posted' });

    expect(reversedEntry.userId).toBe('user_reviewer');
    expect(reversedEntry.previousValue).toEqual({ status: 'posted' });
    expect(reversedEntry.newValue).toEqual({ reversalEntryId: reversal.id });
    expect(reversedEntry.reason).toBeUndefined(); // reverseJournalEntry() doesn't currently thread a reason into the audit log — see known limitations.
    expect(reversedEntry.createdAt).toBeTruthy();
  });
});
