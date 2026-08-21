import { describe, it, expect } from 'vitest';
import { AccountingPeriodService } from './accountingPeriodService';
import { MockAccountingPeriodRepository } from '../repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import type { AccountingPeriod } from '@/types';

function makePeriod(overrides: Partial<AccountingPeriod> = {}): AccountingPeriod {
  return {
    id: 'period_1',
    companyId: 'comp_1',
    financialYearId: 'fy_1',
    name: '2026-01',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-31T23:59:59.999Z',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(periods: AccountingPeriod[] = [makePeriod()]) {
  const periodRepository = new MockAccountingPeriodRepository(periods);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const service = new AccountingPeriodService(periodRepository, auditLog);
  return { service, periodRepository, auditLog };
}

describe('AccountingPeriodService', () => {
  describe('getPeriodForDate / isDateOpenForPosting', () => {
    it('finds the period containing a date', async () => {
      const { service } = setup();
      const period = await service.getPeriodForDate('2026-01-15T00:00:00.000Z');
      expect(period?.id).toBe('period_1');
    });

    it('returns undefined when no period covers the date', async () => {
      const { service } = setup();
      expect(await service.getPeriodForDate('2026-03-01T00:00:00.000Z')).toBeUndefined();
    });

    it('is false when the covering period is not open', async () => {
      const { service } = setup([makePeriod({ status: 'closed' })]);
      expect(await service.isDateOpenForPosting('2026-01-15T00:00:00.000Z')).toBe(false);
    });
  });

  describe('closePeriod / lockPeriod', () => {
    it('closes an open period and logs it', async () => {
      const { service, auditLog } = setup();
      const updated = await service.closePeriod('period_1', 'user_1');
      expect(updated.status).toBe('closed');

      const logs = await auditLog.getForRecord('AccountingPeriod', 'period_1');
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('period_closed');
      expect(logs[0].userId).toBe('user_1');
    });

    it('locks a period and logs it', async () => {
      const { service } = setup([makePeriod({ status: 'closed' })]);
      const updated = await service.lockPeriod('period_1', 'user_1');
      expect(updated.status).toBe('locked');
    });
  });

  describe('reopenPeriod', () => {
    it('requires a non-empty reason', async () => {
      const { service } = setup([makePeriod({ status: 'closed' })]);
      await expect(service.reopenPeriod('period_1', 'user_1', '')).rejects.toThrow(/requires a reason/i);
      await expect(service.reopenPeriod('period_1', 'user_1', '   ')).rejects.toThrow(/requires a reason/i);
    });

    it('reopens a closed period and logs the reason', async () => {
      const { service, auditLog } = setup([makePeriod({ status: 'closed' })]);
      const updated = await service.reopenPeriod('period_1', 'user_1', 'Late supplier invoice received');
      expect(updated.status).toBe('open');

      const logs = await auditLog.getForRecord('AccountingPeriod', 'period_1');
      expect(logs[0].action).toBe('period_reopened');
      expect(logs[0].reason).toBe('Late supplier invoice received');
      expect(logs[0].previousValue).toEqual({ status: 'closed' });
      expect(logs[0].newValue).toEqual({ status: 'open' });
    });
  });

  it('throws when transitioning a period that does not exist', async () => {
    const { service } = setup();
    await expect(service.closePeriod('nope', 'user_1')).rejects.toThrow(/not found/i);
  });
});
