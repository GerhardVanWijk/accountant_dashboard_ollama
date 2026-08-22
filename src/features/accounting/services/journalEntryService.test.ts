import { describe, it, expect } from 'vitest';
import { JournalEntryService } from './journalEntryService';
import { MockJournalEntryRepository } from '../repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '../repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '../repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod } from '@/types';

/** A single accounting period wide open enough to cover every date these tests use. */
function makeOpenPeriod(overrides: Partial<AccountingPeriod> = {}): AccountingPeriod {
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
    ...overrides,
  };
}

function setup(periods: AccountingPeriod[] = [makeOpenPeriod()]) {
  const journalRepository = new MockJournalEntryRepository([]); // start with an empty ledger
  const accountRepository = new MockAccountRepository(seedAccounts);
  const periodRepository = new MockAccountingPeriodRepository(periods);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const service = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
  return { service, journalRepository, accountRepository, periodRepository, auditLog };
}

describe('JournalEntryService', () => {
  describe('validateLines', () => {
    it('accepts a balanced two-line entry', async () => {
      const { service } = setup();
      const result = await service.validateLines([
        { accountId: 'acc_1000', debit: 100, credit: 0 },
        { accountId: 'acc_4000', debit: 0, credit: 100 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects an unbalanced entry', async () => {
      const { service } = setup();
      const result = await service.validateLines([
        { accountId: 'acc_1000', debit: 100, credit: 0 },
        { accountId: 'acc_4000', debit: 0, credit: 90 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not balanced'))).toBe(true);
    });

    it('rejects a single-line entry', async () => {
      const { service } = setup();
      const result = await service.validateLines([{ accountId: 'acc_1000', debit: 100, credit: 0 }]);
      expect(result.valid).toBe(false);
    });

    it('rejects a line referencing an unknown account', async () => {
      const { service } = setup();
      const result = await service.validateLines([
        { accountId: 'acc_does_not_exist', debit: 100, credit: 0 },
        { accountId: 'acc_4000', debit: 0, credit: 100 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('does not exist'))).toBe(true);
    });

    it('rejects a line carrying both a debit and a credit', async () => {
      const { service } = setup();
      const result = await service.validateLines([
        { accountId: 'acc_1000', debit: 100, credit: 50 },
        { accountId: 'acc_4000', debit: 0, credit: 50 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('both a debit and a credit'))).toBe(true);
    });

    it('tolerates sub-cent floating point rounding', async () => {
      const { service } = setup();
      const result = await service.validateLines([
        { accountId: 'acc_1000', debit: 0.1 + 0.2, credit: 0 },
        { accountId: 'acc_4000', debit: 0, credit: 0.3 },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('postJournalEntry', () => {
    it('posts a balanced entry and assigns an entry number', async () => {
      const { service } = setup();
      const entry = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        memo: 'Test sale',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 500, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 500 },
        ],
      });
      expect(entry.status).toBe('posted');
      expect(entry.entryNumber).toBe('JE-0001');
      expect(entry.id).toBeTruthy();
    });

    it('throws rather than posting an unbalanced entry', async () => {
      const { service } = setup();
      await expect(
        service.postJournalEntry({
          date: '2026-02-01T00:00:00.000Z',
          source: 'manual',
          lines: [
            { accountId: 'acc_1000', debit: 500, credit: 0 },
            { accountId: 'acc_4000', debit: 0, credit: 400 },
          ],
        }),
      ).rejects.toThrow(/unbalanced/i);
    });

    it('writes a "posted" audit log entry attributed to the posting user', async () => {
      const { service, auditLog } = setup();
      const entry = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        postedByUserId: 'user_alice',
        lines: [
          { accountId: 'acc_1000', debit: 500, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 500 },
        ],
      });

      const logs = await auditLog.getForRecord('JournalEntry', entry.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('posted');
      expect(logs[0].userId).toBe('user_alice');
    });

    it('attributes to SYSTEM_USER_ID when no user is supplied', async () => {
      const { service, auditLog } = setup();
      const entry = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 100, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 100 },
        ],
      });
      const logs = await auditLog.getForRecord('JournalEntry', entry.id);
      expect(logs[0].userId).toBe('system');
    });

    it('defaults currency to ZAR when the caller does not specify one', async () => {
      const { service } = setup();
      const entry = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 100, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 100 },
        ],
      });
      expect(entry.currency).toBe('ZAR');
    });

    it('honors an explicit currency override', async () => {
      const { service } = setup();
      const entry = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        currency: 'USD',
        lines: [
          { accountId: 'acc_1000', debit: 100, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 100 },
        ],
      });
      expect(entry.currency).toBe('USD');
    });
  });

  describe('accounting period enforcement', () => {
    it('rejects posting when no accounting period covers the date', async () => {
      const { service } = setup([]); // no periods defined at all
      await expect(
        service.postJournalEntry({
          date: '2026-02-01T00:00:00.000Z',
          source: 'manual',
          lines: [
            { accountId: 'acc_1000', debit: 100, credit: 0 },
            { accountId: 'acc_4000', debit: 0, credit: 100 },
          ],
        }),
      ).rejects.toThrow(/no accounting period is defined/i);
    });

    it('rejects posting into a closed period', async () => {
      const { service } = setup([makeOpenPeriod({ status: 'closed' })]);
      await expect(
        service.postJournalEntry({
          date: '2026-02-01T00:00:00.000Z',
          source: 'manual',
          lines: [
            { accountId: 'acc_1000', debit: 100, credit: 0 },
            { accountId: 'acc_4000', debit: 0, credit: 100 },
          ],
        }),
      ).rejects.toThrow(/closed, not open/i);
    });

    it('rejects posting into a locked period', async () => {
      const { service } = setup([makeOpenPeriod({ status: 'locked' })]);
      await expect(
        service.postJournalEntry({
          date: '2026-02-01T00:00:00.000Z',
          source: 'manual',
          lines: [
            { accountId: 'acc_1000', debit: 100, credit: 0 },
            { accountId: 'acc_4000', debit: 0, credit: 100 },
          ],
        }),
      ).rejects.toThrow(/locked, not open/i);
    });

    it('allows posting into an open period', async () => {
      const { service } = setup([makeOpenPeriod({ status: 'open' })]);
      const entry = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 100, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 100 },
        ],
      });
      expect(entry.status).toBe('posted');
    });
  });

  describe('reverseJournalEntry', () => {
    it('creates a new balanced offsetting entry without mutating the original', async () => {
      const { service } = setup();
      const original = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 500, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 500 },
        ],
      });

      const reversal = await service.reverseJournalEntry(original.id);

      expect(reversal.reversalOfEntryId).toBe(original.id);
      expect(reversal.lines.find((l) => l.accountId === 'acc_1000')?.credit).toBe(500);
      expect(reversal.lines.find((l) => l.accountId === 'acc_4000')?.debit).toBe(500);

      // The original row itself is untouched — still status 'posted', not 'reversed'.
      const originalAfter = await service.getEntry(original.id);
      expect(originalAfter?.status).toBe('posted');
      expect(await service.isReversed(original.id)).toBe(true);
    });

    it('carries the original entry\'s currency forward onto the reversal', async () => {
      const { service } = setup();
      const original = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        currency: 'USD',
        lines: [
          { accountId: 'acc_1000', debit: 500, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 500 },
        ],
      });
      const reversal = await service.reverseJournalEntry(original.id);
      expect(reversal.currency).toBe('USD');
    });

    it('refuses to reverse the same entry twice', async () => {
      const { service } = setup();
      const original = await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 100, credit: 0 },
          { accountId: 'acc_4000', debit: 0, credit: 100 },
        ],
      });
      await service.reverseJournalEntry(original.id);
      await expect(service.reverseJournalEntry(original.id)).rejects.toThrow(/already been reversed/i);
    });

    it('refuses to reverse an entry that does not exist', async () => {
      const { service } = setup();
      await expect(service.reverseJournalEntry('nope')).rejects.toThrow(/not found/i);
    });
  });

  describe('computeTrialBalance', () => {
    it('always balances after only using postJournalEntry', async () => {
      const { service } = setup();
      await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 1000, credit: 0 },
          { accountId: 'acc_3000', debit: 0, credit: 1000 },
        ],
      });
      await service.postJournalEntry({
        date: '2026-02-02T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_5100', debit: 200, credit: 0 },
          { accountId: 'acc_1000', debit: 0, credit: 200 },
        ],
      });

      const trialBalance = await service.computeTrialBalance();
      expect(trialBalance.balanced).toBe(true);
      expect(trialBalance.totalDebits).toBeCloseTo(trialBalance.totalCredits, 2);

      const cash = trialBalance.rows.find((r) => r.accountId === 'acc_1000');
      expect(cash?.debit).toBeCloseTo(800, 2); // 1000 in, 200 out, debit-normal
    });

    it('omits accounts with a zero net balance', async () => {
      const { service } = setup();
      const trialBalance = await service.computeTrialBalance();
      expect(trialBalance.rows).toEqual([]);
      expect(trialBalance.balanced).toBe(true);
    });
  });

  describe('getAccountLedger', () => {
    it('computes a running balance in the account normal-balance direction', async () => {
      const { service } = setup();
      await service.postJournalEntry({
        date: '2026-02-01T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_1000', debit: 300, credit: 0 },
          { accountId: 'acc_3000', debit: 0, credit: 300 },
        ],
      });
      await service.postJournalEntry({
        date: '2026-02-05T00:00:00.000Z',
        source: 'manual',
        lines: [
          { accountId: 'acc_5100', debit: 120, credit: 0 },
          { accountId: 'acc_1000', debit: 0, credit: 120 },
        ],
      });

      const ledger = await service.getAccountLedger('acc_1000');
      expect(ledger.map((r) => r.runningBalance)).toEqual([300, 180]);
    });

    it('throws for an unknown account', async () => {
      const { service } = setup();
      await expect(service.getAccountLedger('nope')).rejects.toThrow(/not found/i);
    });
  });
});
