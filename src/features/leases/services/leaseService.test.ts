import { describe, it, expect, beforeEach } from 'vitest';
import type { AccountingPeriod } from '@/types';
import { LeaseService } from './leaseService';
import { calculateLeaseLiabilityPresentValue } from './leaseCalculations';
import { MockLeaseRepository } from '../repositories/MockLeaseRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

const RIGHT_OF_USE_ASSET_ACCOUNT_ID = 'acc_1700';
const LEASE_LIABILITY_ACCOUNT_ID = 'acc_2450';

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

describe('LeaseService', () => {
  let leaseRepository: MockLeaseRepository;
  let leaseService: LeaseService;
  let journalEntryService: JournalEntryService;

  beforeEach(() => {
    leaseRepository = new MockLeaseRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    leaseService = new LeaseService(leaseRepository, journalEntryService, new AccountMappingService(new AccountService(accountRepository, journalRepository)));
  });

  describe('createLease', () => {
    it('computes initialLeaseLiability/initialRightOfUseAsset via the PV formula and starts as a draft with zero outstanding liability', async () => {
      const lease = await leaseService.createLease({
        lessorName: 'ACME Leasing (Pty) Ltd',
        assetDescription: 'Delivery truck',
        commencementDate: '2026-01-01',
        leaseTermMonths: 36,
        monthlyPayment: 10000,
        discountRatePercent: 10,
      });

      const expectedPv = calculateLeaseLiabilityPresentValue(10000, 36, 10);
      expect(lease.status).toBe('draft');
      expect(lease.leaseNumber).toBe('LSE-0001');
      expect(lease.initialLeaseLiability).toBeCloseTo(expectedPv, 2);
      expect(lease.initialRightOfUseAsset).toBeCloseTo(expectedPv, 2);
      expect(lease.accumulatedDepreciation).toBe(0);
      expect(lease.outstandingLeaseLiability).toBe(0);
      expect(lease.journalEntryId).toBeUndefined();
    });

    it('numbers leases sequentially', async () => {
      const l1 = await leaseService.createLease({
        lessorName: 'A', assetDescription: 'x', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 100, discountRatePercent: 5,
      });
      const l2 = await leaseService.createLease({
        lessorName: 'B', assetDescription: 'y', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 100, discountRatePercent: 5,
      });
      expect(l1.leaseNumber).toBe('LSE-0001');
      expect(l2.leaseNumber).toBe('LSE-0002');
    });

    it('rejects invalid economics', async () => {
      const base = { lessorName: 'A', assetDescription: 'x', commencementDate: '2026-01-01' };
      await expect(leaseService.createLease({ ...base, leaseTermMonths: 0, monthlyPayment: 100, discountRatePercent: 5 })).rejects.toThrow(/term/);
      await expect(leaseService.createLease({ ...base, leaseTermMonths: 12, monthlyPayment: 0, discountRatePercent: 5 })).rejects.toThrow(/payment/);
      await expect(leaseService.createLease({ ...base, leaseTermMonths: 12, monthlyPayment: 100, discountRatePercent: -1 })).rejects.toThrow(/rate/);
    });
  });

  describe('updateLease', () => {
    it('recomputes the present value when economics change, only while draft', async () => {
      const lease = await leaseService.createLease({
        lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
      });
      const updated = await leaseService.updateLease(lease.id, { monthlyPayment: 2000 });
      const expectedPv = calculateLeaseLiabilityPresentValue(2000, 12, 10);
      expect(updated.initialLeaseLiability).toBeCloseTo(expectedPv, 2);
      expect(updated.initialRightOfUseAsset).toBeCloseTo(expectedPv, 2);
    });

    it('rejects editing a lease that has already commenced', async () => {
      const lease = await leaseService.createLease({
        lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
      });
      await leaseService.postCommencement(lease.id);
      await expect(leaseService.updateLease(lease.id, { monthlyPayment: 5000 })).rejects.toThrow(/already commenced/);
    });
  });

  describe('deleteLease', () => {
    it('deletes a draft but rejects deleting a commenced lease', async () => {
      const lease = await leaseService.createLease({
        lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
      });
      await leaseService.deleteLease(lease.id);
      expect(await leaseRepository.getById(lease.id)).toBeUndefined();

      const commenced = await leaseService.createLease({
        lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
      });
      await leaseService.postCommencement(commenced.id);
      await expect(leaseService.deleteLease(commenced.id)).rejects.toThrow(/only a draft/);
    });
  });

  describe('postCommencement', () => {
    it('posts a balanced DR ROU / CR Lease Liability entry and activates the lease', async () => {
      const lease = await leaseService.createLease({
        lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
      });
      const posted = await leaseService.postCommencement(lease.id, 'user_1');

      expect(posted.status).toBe('active');
      expect(posted.outstandingLeaseLiability).toBeCloseTo(posted.initialLeaseLiability, 2);
      expect(posted.journalEntryId).toBeDefined();

      const entry = await journalEntryService.getEntry(posted.journalEntryId!);
      expect(entry!.lines).toHaveLength(2);
      const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit, 2);

      const rouLedger = await journalEntryService.getAccountLedger(RIGHT_OF_USE_ASSET_ACCOUNT_ID);
      expect(rouLedger[rouLedger.length - 1].runningBalance).toBeCloseTo(posted.initialLeaseLiability, 2);
      const liabilityLedger = await journalEntryService.getAccountLedger(LEASE_LIABILITY_ACCOUNT_ID);
      expect(liabilityLedger[liabilityLedger.length - 1].runningBalance).toBeCloseTo(posted.initialLeaseLiability, 2);

      const trialBalance = await journalEntryService.computeTrialBalance();
      expect(trialBalance.balanced).toBe(true);
    });

    it('rejects commencing an already-commenced lease', async () => {
      const lease = await leaseService.createLease({
        lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
      });
      await leaseService.postCommencement(lease.id);
      await expect(leaseService.postCommencement(lease.id)).rejects.toThrow(/already commenced/);
    });
  });
});
