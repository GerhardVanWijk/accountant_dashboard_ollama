import { describe, it, expect, beforeEach } from 'vitest';
import type { AccountingPeriod } from '@/types';
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
import type { LeaseContract } from '@/types/lease';

const INTEREST_EXPENSE_LEASE_ACCOUNT_ID = 'acc_5810';
const LEASE_LIABILITY_ACCOUNT_ID = 'acc_2450';
const CASH_AND_BANK_ACCOUNT_ID = 'acc_1000';
const DEPRECIATION_EXPENSE_ROU_ACCOUNT_ID = 'acc_5800';
const ACCUMULATED_DEPRECIATION_ROU_ACCOUNT_ID = 'acc_1790';

function makePeriods(): AccountingPeriod[] {
  return [
    {
      id: 'p2026',
      companyId: 'comp_test',
      financialYearId: 'fy_2026',
      name: '2026 (test)',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T23:59:59.999Z',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p2027',
      companyId: 'comp_test',
      financialYearId: 'fy_2027',
      name: '2027 (test)',
      startDate: '2027-01-01T00:00:00.000Z',
      endDate: '2027-12-31T23:59:59.999Z',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

describe('LeaseAmortizationService.runAmortization', () => {
  let leaseRepository: MockLeaseRepository;
  let amortizationRepository: MockLeaseAmortizationEntryRepository;
  let leaseService: LeaseService;
  let amortizationService: LeaseAmortizationService;
  let journalEntryService: JournalEntryService;

  async function activeLease(overrides: Partial<{
    leaseTermMonths: number;
    monthlyPayment: number;
    discountRatePercent: number;
  }> = {}): Promise<LeaseContract> {
    const created = await leaseService.createLease({
      lessorName: 'ACME Leasing (Pty) Ltd',
      assetDescription: 'Delivery truck',
      commencementDate: '2026-01-01',
      leaseTermMonths: overrides.leaseTermMonths ?? 12,
      monthlyPayment: overrides.monthlyPayment ?? 1000,
      discountRatePercent: overrides.discountRatePercent ?? 12,
    });
    return leaseService.postCommencement(created.id);
  }

  beforeEach(() => {
    leaseRepository = new MockLeaseRepository([]);
    amortizationRepository = new MockLeaseAmortizationEntryRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository(makePeriods());
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    leaseService = new LeaseService(leaseRepository, journalEntryService, accountMapper);
    amortizationService = new LeaseAmortizationService(amortizationRepository, leaseRepository, journalEntryService, accountMapper);
  });

  it('posts one balanced combined entry across multiple leases, with interest + principal === payment', async () => {
    const leaseA = await activeLease({ monthlyPayment: 1000 });
    const leaseB = await activeLease({ monthlyPayment: 500 });

    const result = await amortizationService.runAmortization('2026-01-31');
    expect(result.entries).toHaveLength(2);
    expect(result.journalEntryId).toBeDefined();

    const entry = await journalEntryService.getEntry(result.journalEntryId!);
    const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);

    const trialBalance = await journalEntryService.computeTrialBalance();
    expect(trialBalance.balanced).toBe(true);

    const entryA = result.entries.find((e) => e.leaseId === leaseA.id)!;
    const entryB = result.entries.find((e) => e.leaseId === leaseB.id)!;
    expect(entryA.interestAmount + entryA.principalAmount).toBeCloseTo(1000, 2);
    expect(entryB.interestAmount + entryB.principalAmount).toBeCloseTo(500, 2);
  });

  it('posts the expected net vectors to each GL account', async () => {
    await activeLease({ monthlyPayment: 1000, discountRatePercent: 12 });
    const result = await amortizationService.runAmortization('2026-01-31');
    const entry = await journalEntryService.getEntry(result.journalEntryId!);

    const interestLine = entry!.lines.find((l) => l.accountId === INTEREST_EXPENSE_LEASE_ACCOUNT_ID)!;
    const liabilityLine = entry!.lines.find((l) => l.accountId === LEASE_LIABILITY_ACCOUNT_ID)!;
    const cashLine = entry!.lines.find((l) => l.accountId === CASH_AND_BANK_ACCOUNT_ID)!;
    const depExpenseLine = entry!.lines.find((l) => l.accountId === DEPRECIATION_EXPENSE_ROU_ACCOUNT_ID)!;
    const accumDepLine = entry!.lines.find((l) => l.accountId === ACCUMULATED_DEPRECIATION_ROU_ACCOUNT_ID)!;

    const [runEntry] = result.entries;
    expect(interestLine.debit).toBeCloseTo(runEntry.interestAmount, 2);
    expect(interestLine.credit).toBe(0);
    expect(liabilityLine.debit).toBeCloseTo(runEntry.principalAmount, 2); // paying down a credit-normal liability is a DEBIT
    expect(liabilityLine.credit).toBe(0);
    expect(cashLine.credit).toBeCloseTo(runEntry.interestAmount + runEntry.principalAmount, 2); // cash paid out is a CREDIT
    expect(cashLine.debit).toBe(0);
    expect(depExpenseLine.debit).toBeCloseTo(runEntry.depreciationAmount, 2);
    expect(accumDepLine.credit).toBeCloseTo(runEntry.depreciationAmount, 2); // contra-asset increasing is a CREDIT
  });

  it('updates the lease\'s accumulatedDepreciation and outstandingLeaseLiability and records a ledger row', async () => {
    const lease = await activeLease({ monthlyPayment: 1000, discountRatePercent: 12, leaseTermMonths: 12 });
    await amortizationService.runAmortization('2026-01-31');

    const updated = await leaseRepository.getById(lease.id);
    expect(updated!.accumulatedDepreciation).toBeGreaterThan(0);
    expect(updated!.outstandingLeaseLiability).toBeLessThan(lease.initialLeaseLiability);

    const history = await amortizationService.getAmortizationHistory(lease.id);
    expect(history).toHaveLength(1);
    expect(history[0].outstandingLeaseLiabilityAfter).toBeCloseTo(updated!.outstandingLeaseLiability, 2);
    expect(history[0].accumulatedDepreciationAfter).toBeCloseTo(updated!.accumulatedDepreciation, 2);
  });

  it('is idempotent for the same period end — a second run finds nothing eligible', async () => {
    await activeLease();
    const first = await amortizationService.runAmortization('2026-01-31');
    expect(first.entries).toHaveLength(1);

    const second = await amortizationService.runAmortization('2026-01-31');
    expect(second.entries).toHaveLength(0);
    expect(second.journalEntryId).toBeUndefined();
  });

  it('runs the full schedule to (near) zero and stops posting once the liability is extinguished', async () => {
    const lease = await activeLease({ monthlyPayment: 1000, discountRatePercent: 12, leaseTermMonths: 6 });

    for (let month = 1; month <= 6; month++) {
      const result = await amortizationService.runAmortization(`2026-${String(month).padStart(2, '0')}-28`);
      expect(result.entries).toHaveLength(1);
    }

    const final = await leaseRepository.getById(lease.id);
    expect(final!.outstandingLeaseLiability).toBeCloseTo(0, 1);
    expect(final!.accumulatedDepreciation).toBeCloseTo(final!.initialRightOfUseAsset, 1);

    // A 7th run finds nothing left to do — the liability is already ~0.
    const seventh = await amortizationService.runAmortization('2026-07-28');
    expect(seventh.entries).toHaveLength(0);
  });

  it('excludes draft leases from a run', async () => {
    await leaseService.createLease({
      lessorName: 'Never Commenced', assetDescription: 'x', commencementDate: '2026-01-01', leaseTermMonths: 12, monthlyPayment: 500, discountRatePercent: 10,
    });
    const result = await amortizationService.runAmortization('2026-01-31');
    expect(result.entries).toHaveLength(0);
  });
});
