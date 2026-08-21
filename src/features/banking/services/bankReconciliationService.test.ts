import { describe, it, expect } from 'vitest';
import { BankReconciliationService } from './bankReconciliationService';
import { MockBankReconciliationRepository } from '../repositories/MockBankReconciliationRepository';
import { MockBankTransactionRepository } from '../repositories/MockBankTransactionRepository';
import { MockBankAccountRepository } from '../repositories/MockBankAccountRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import type { BankAccount } from '@/types';
import type { BankTransactionWithAllocations } from '../types';

const ACCOUNT_ID = 'bank_test';

function makeAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: ACCOUNT_ID,
    name: 'Test Current Account',
    bankName: 'FNB',
    accountNumber: '123',
    accountType: 'checking',
    currency: 'ZAR',
    openingBalance: 1000,
    currentBalance: 1000,
    glAccountId: 'acc_1000',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTxn(overrides: Partial<BankTransactionWithAllocations>): BankTransactionWithAllocations {
  return {
    id: overrides.id ?? 'txn_1',
    bankAccountId: ACCOUNT_ID,
    date: '2026-03-01T00:00:00.000Z',
    description: 'Test txn',
    amount: 100,
    direction: 'debit',
    status: 'unreconciled',
    allocations: [{ id: 'a1', glAccountId: 'acc_4000', netAmount: 100, taxAmount: 0 }],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(txns: BankTransactionWithAllocations[], account: BankAccount = makeAccount()) {
  const reconciliationRepository = new MockBankReconciliationRepository([]);
  const bankTransactionRepository = new MockBankTransactionRepository(txns);
  const bankAccountRepository = new MockBankAccountRepository([account]);
  const auditLog = new AuditLogService(new MockAuditLogRepository());
  const service = new BankReconciliationService(reconciliationRepository, bankTransactionRepository, bankAccountRepository, auditLog);
  return { service, reconciliationRepository, bankTransactionRepository, bankAccountRepository, auditLog };
}

describe('BankReconciliationService', () => {
  describe('computeSummary', () => {
    it('is balanced when the statement balance matches the GL cashbook balance exactly, with the item cleared', async () => {
      const txn = makeTxn({ id: 't1', amount: 500, direction: 'debit' });
      const { service } = setup([txn]);
      // GL cashbook balance = opening (1000) + 500 = 1500. Item is ticked as cleared (on the statement).
      const summary = await service.computeSummary(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1500, ['t1']);
      expect(summary.glCashbookBalance).toBeCloseTo(1500);
      expect(summary.variance).toBeCloseTo(0);
      expect(summary.isBalanced).toBe(true);
    });

    it('reports a non-zero variance when the statement balance does not match', async () => {
      const txn = makeTxn({ id: 't1', amount: 500, direction: 'debit' });
      const { service } = setup([txn]);
      const summary = await service.computeSummary(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1400, ['t1']);
      expect(summary.variance).toBeCloseTo(100);
      expect(summary.isBalanced).toBe(false);
    });

    it('nets uncleared deposits and unpresented payments into the adjusted bank balance', async () => {
      const deposit = makeTxn({ id: 't1', amount: 500, direction: 'debit' });
      const payment = makeTxn({ id: 't2', amount: 200, direction: 'credit' });
      const { service } = setup([deposit, payment]);
      // GL cashbook = 1000 + 500 - 200 = 1300. Statement shows 1000 (neither item cleared yet).
      const summary = await service.computeSummary(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1000, []);
      expect(summary.unclearedDepositsTotal).toBeCloseTo(500);
      expect(summary.unpresentedPaymentsTotal).toBeCloseTo(200);
      // Adjusted bank balance = 1000 + 500 - 200 = 1300, matching GL cashbook balance.
      expect(summary.adjustedBankBalance).toBeCloseTo(1300);
      expect(summary.variance).toBeCloseTo(0);
      expect(summary.isBalanced).toBe(true);
    });

    it('flags transactions with no allocation as unallocated', async () => {
      const unallocated = makeTxn({ id: 't1', amount: 100, allocations: [] });
      const { service } = setup([unallocated]);
      const summary = await service.computeSummary(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1100, []);
      expect(summary.unallocatedItems).toHaveLength(1);
    });

    it('does not flag a transfer leg (empty allocations) as unallocated', async () => {
      const transferLeg = makeTxn({ id: 't1', amount: 100, allocations: [], transferPairId: 't2' });
      const { service } = setup([transferLeg]);
      const summary = await service.computeSummary(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1100, []);
      expect(summary.unallocatedItems).toHaveLength(0);
    });
  });

  describe('finalizeReconciliation', () => {
    it('throws and writes nothing when variance is non-zero', async () => {
      const txn = makeTxn({ id: 't1', amount: 500, direction: 'debit' });
      const { service, reconciliationRepository, bankTransactionRepository } = setup([txn]);

      await expect(
        service.finalizeReconciliation(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1400, ['t1'], 'user_1'),
      ).rejects.toThrow(/out of balance/i);

      expect(await reconciliationRepository.getAll()).toHaveLength(0);
      const stillUnreconciled = await bankTransactionRepository.getById('t1');
      expect(stillUnreconciled?.status).toBe('unreconciled');
    });

    it('throws when an outstanding item still needs allocation, even if variance is zero', async () => {
      const unallocated = makeTxn({ id: 't1', amount: 500, direction: 'debit', allocations: [] });
      const { service } = setup([unallocated]);

      await expect(
        service.finalizeReconciliation(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1500, ['t1'], 'user_1'),
      ).rejects.toThrow(/allocation/i);
    });

    it('creates an immutable snapshot and marks cleared transactions reconciled when variance is zero', async () => {
      const txn = makeTxn({ id: 't1', amount: 500, direction: 'debit' });
      const { service, reconciliationRepository, bankTransactionRepository, auditLog } = setup([txn]);

      const record = await service.finalizeReconciliation(
        ACCOUNT_ID,
        '2026-03-02T00:00:00.000Z',
        1500,
        ['t1'],
        'user_1',
        'Month-end reconciliation',
      );

      expect(record.variance).toBeCloseTo(0);
      expect(record.clearedTransactionIds).toEqual(['t1']);
      expect(record.finalizedByUserId).toBe('user_1');

      const stored = await reconciliationRepository.getAll();
      expect(stored).toHaveLength(1);

      const clearedTxn = await bankTransactionRepository.getById('t1');
      expect(clearedTxn?.status).toBe('reconciled');
      expect(clearedTxn?.reconciliationId).toBe(record.id);

      const auditEntries = await auditLog.getAll();
      expect(auditEntries.some((e) => e.action === 'bank_reconciled' && e.recordId === record.id)).toBe(true);
    });

    it('refuses to finalize with no cleared items selected', async () => {
      const { service } = setup([]);
      await expect(
        service.finalizeReconciliation(ACCOUNT_ID, '2026-03-02T00:00:00.000Z', 1000, [], 'user_1'),
      ).rejects.toThrow(/select at least one/i);
    });

    it('the reconciliation repository exposes no update/delete — a finalized snapshot cannot be mutated', () => {
      const { reconciliationRepository } = setup([]);
      expect((reconciliationRepository as unknown as { update?: unknown }).update).toBeUndefined();
      expect((reconciliationRepository as unknown as { delete?: unknown }).delete).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    it('returns finalized reconciliations newest first', async () => {
      const txn1 = makeTxn({ id: 't1', amount: 100, direction: 'debit', date: '2026-01-05T00:00:00.000Z' });
      const txn2 = makeTxn({ id: 't2', amount: 200, direction: 'debit', date: '2026-02-05T00:00:00.000Z' });
      const { service } = setup([txn1, txn2]);

      await service.finalizeReconciliation(ACCOUNT_ID, '2026-01-06T00:00:00.000Z', 1100, ['t1'], 'user_1');
      await service.finalizeReconciliation(ACCOUNT_ID, '2026-02-06T00:00:00.000Z', 1300, ['t2'], 'user_1');

      const history = await service.getHistory(ACCOUNT_ID);
      expect(history).toHaveLength(2);
      expect(history[0].statementDate).toBe('2026-02-06T00:00:00.000Z');
      expect(history[1].statementDate).toBe('2026-01-06T00:00:00.000Z');
    });
  });
});
