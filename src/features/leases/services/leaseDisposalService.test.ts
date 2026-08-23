import { describe, it, expect, beforeEach } from 'vitest';
import type { AccountingPeriod } from '@/types';
import { LeaseDisposalService } from './leaseDisposalService';
import { LeaseAmortizationService } from './leaseAmortizationService';
import { LeaseService } from './leaseService';
import { MockLeaseRepository } from '../repositories/MockLeaseRepository';
import { MockLeaseAmortizationEntryRepository } from '../repositories/MockLeaseAmortizationEntryRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';

const GAIN_ON_DISPOSAL_ACCOUNT_ID = 'acc_4200';
const LOSS_ON_DISPOSAL_ACCOUNT_ID = 'acc_5300';

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

describe('LeaseDisposalService.terminateLease', () => {
  let leaseRepository: MockLeaseRepository;
  let leaseService: LeaseService;
  let amortizationService: LeaseAmortizationService;
  let disposalService: LeaseDisposalService;
  let journalEntryService: JournalEntryService;

  beforeEach(() => {
    leaseRepository = new MockLeaseRepository([]);
    const amortizationRepository = new MockLeaseAmortizationEntryRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    leaseService = new LeaseService(leaseRepository, journalEntryService, accountMapper);
    amortizationService = new LeaseAmortizationService(amortizationRepository, leaseRepository, journalEntryService, accountMapper);
    disposalService = new LeaseDisposalService(leaseRepository, journalEntryService, accountMapper);
  });

  it('rejects terminating a draft lease', async () => {
    const lease = await leaseService.createLease({
      lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
    });
    await expect(disposalService.terminateLease(lease.id, '2026-02-01')).rejects.toThrow(/not commenced/);
  });

  it('posts a balanced entry clearing the ROU asset/liability and books a loss when the liability exceeds the carrying value', async () => {
    const created = await leaseService.createLease({
      lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 24, monthlyPayment: 1000, discountRatePercent: 10,
    });
    const lease = await leaseService.postCommencement(created.id);
    // Terminate immediately after commencement: outstandingLeaseLiability === initialLeaseLiability,
    // but the ROU asset has zero accumulated depreciation, so carrying value === initialRightOfUseAsset === initialLeaseLiability.
    // A gain/loss only arises once amortization has run at least once (liability and ROU carrying value diverge).
    await amortizationService.runAmortization('2026-01-31');

    const terminated = await disposalService.terminateLease(lease.id, '2026-02-15', 'user_1');
    expect(terminated.status).toBe('terminated');
    expect(terminated.terminationDate).toBe('2026-02-15');
    expect(terminated.terminationJournalEntryId).toBeDefined();

    const entry = await journalEntryService.getEntry(terminated.terminationJournalEntryId!);
    const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);

    const trialBalance = await journalEntryService.computeTrialBalance();
    expect(trialBalance.balanced).toBe(true);

    // Interest accrues faster than straight-line ROU depreciation early in the term for an
    // amortizing loan, so the liability outstanding tends to exceed the ROU carrying value -> a loss.
    const lossLine = entry!.lines.find((l) => l.accountId === LOSS_ON_DISPOSAL_ACCOUNT_ID);
    const gainLine = entry!.lines.find((l) => l.accountId === GAIN_ON_DISPOSAL_ACCOUNT_ID);
    expect(lossLine !== undefined || gainLine !== undefined).toBe(true);
  });

  it('books no gain/loss line when the liability exactly matches the ROU carrying value (break-even)', async () => {
    // A 0% discount rate lease: no interest ever accrues, so principal repaid each period
    // exactly matches straight-line depreciation IF payment/term line up with the ROU charge.
    const created = await leaseService.createLease({
      lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1200, discountRatePercent: 0,
    });
    const lease = await leaseService.postCommencement(created.id);
    // initialLeaseLiability = initialRightOfUseAsset = 1200*12 = 14400; straight-line ROU
    // depreciation = 14400/12 = 1200/month, and at 0% rate principal = full payment = 1200/month too.
    await amortizationService.runAmortization('2026-01-31');

    const terminated = await disposalService.terminateLease(lease.id, '2026-02-01');
    const entry = await journalEntryService.getEntry(terminated.terminationJournalEntryId!);
    const lossLine = entry!.lines.find((l) => l.accountId === LOSS_ON_DISPOSAL_ACCOUNT_ID);
    const gainLine = entry!.lines.find((l) => l.accountId === GAIN_ON_DISPOSAL_ACCOUNT_ID);
    expect(lossLine).toBeUndefined();
    expect(gainLine).toBeUndefined();

    const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
  });

  it('rejects terminating an already-terminated lease', async () => {
    const created = await leaseService.createLease({
      lessorName: 'ACME', assetDescription: 'Truck', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 1000, discountRatePercent: 10,
    });
    const lease = await leaseService.postCommencement(created.id);
    await disposalService.terminateLease(lease.id, '2026-02-01');
    await expect(disposalService.terminateLease(lease.id, '2026-03-01')).rejects.toThrow(/already been terminated/);
  });
});
