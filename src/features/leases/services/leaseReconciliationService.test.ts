import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileLeaseRegisterToGl } from './leaseReconciliationService';
import { LeaseService } from './leaseService';
import { LeaseAmortizationService } from './leaseAmortizationService';
import { MockLeaseRepository } from '../repositories/MockLeaseRepository';
import { MockLeaseAmortizationEntryRepository } from '../repositories/MockLeaseAmortizationEntryRepository';
import { FakeLeaseCommencementExecutor } from './leaseCommencementExecutor';
import { FakeLeaseAmortizationPeriodExecutor } from './leaseAmortizationPeriodExecutor';
import type { LeasePeriodSettlementExecutor } from './leasePeriodSettlementExecutor';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import type { AccountingPeriod } from '@/types';

function makeOpenPeriod(): AccountingPeriod {
  return {
    id: 'p', companyId: 'c', financialYearId: 'fy', name: '2026',
    startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T23:59:59.999Z', status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('reconcileLeaseRegisterToGl', () => {
  let leaseService: LeaseService;
  let leaseAmortizationService: LeaseAmortizationService;
  let leaseRepository: MockLeaseRepository;
  let journalEntryService: JournalEntryService;

  beforeEach(() => {
    leaseRepository = new MockLeaseRepository([]);
    const amortizationRepository = new MockLeaseAmortizationEntryRepository([]);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, new AuditLogService(new MockAuditLogRepository()));
    const accountMapper = new AccountMappingService(new AccountService(accountRepository, journalRepository));
    const commencementExecutor = new FakeLeaseCommencementExecutor({ journal: journalEntryService, leases: leaseRepository });
    leaseService = new LeaseService(leaseRepository, commencementExecutor, accountMapper);
    const periodExecutor = new FakeLeaseAmortizationPeriodExecutor({ journal: journalEntryService, leases: leaseRepository, amortizationEntries: amortizationRepository });
    const unusedSettlementExecutor: LeasePeriodSettlementExecutor = { settle: async () => { throw new Error('settlement not exercised in this test'); } };
    leaseAmortizationService = new LeaseAmortizationService(amortizationRepository, leaseRepository, periodExecutor, accountMapper, unusedSettlementExecutor);
  });

  async function commencedLease() {
    const created = await leaseService.createLease({
      lessorName: 'Lessor', assetDescription: 'Forklift', commencementDate: '2026-01-01',
      leaseTermMonths: 36, monthlyPayment: 10000, discountRatePercent: 10,
    });
    return leaseService.postCommencement(created.id);
  }

  it('reconciles ROU cost, accumulated depreciation and lease liability to the GL after commencement', async () => {
    await commencedLease();
    await commencedLease();

    const recon = await reconcileLeaseRegisterToGl(journalEntryService, await leaseRepository.getAll(), seedAccounts);

    expect(recon.isReconciled).toBe(true);
    expect(recon.totals.rouCostVariance).toBeCloseTo(0, 2);
    expect(recon.totals.leaseLiabilityVariance).toBeCloseTo(0, 2);
    expect(recon.totals.accumulatedDepreciationVariance).toBeCloseTo(0, 2);
  });

  it('stays reconciled after amortization runs', async () => {
    await commencedLease();
    await leaseAmortizationService.runAmortization('2026-01-31');
    await leaseAmortizationService.runAmortization('2026-02-28');

    const recon = await reconcileLeaseRegisterToGl(journalEntryService, await leaseRepository.getAll(), seedAccounts);
    expect(recon.isReconciled).toBe(true);
    expect(recon.totals.leaseLiabilityVariance).toBeCloseTo(0, 2);
    expect(recon.totals.accumulatedDepreciationVariance).toBeCloseTo(0, 2);
  });

  it('excludes draft leases (not in the GL yet)', async () => {
    await commencedLease();
    await leaseService.createLease({
      lessorName: 'Lessor 2', assetDescription: 'Draft van', commencementDate: '2026-01-01',
      leaseTermMonths: 24, monthlyPayment: 999999, discountRatePercent: 10,
    });

    const recon = await reconcileLeaseRegisterToGl(journalEntryService, await leaseRepository.getAll(), seedAccounts);
    expect(recon.isReconciled).toBe(true);
    expect(recon.totals.registerRouCost).not.toBeCloseTo(999999, 0);
  });

  it('flags a variance when the register is tampered with out of band', async () => {
    const lease = await commencedLease();
    await leaseRepository.update(lease.id, { outstandingLeaseLiability: lease.outstandingLeaseLiability + 5000 });

    const recon = await reconcileLeaseRegisterToGl(journalEntryService, await leaseRepository.getAll(), seedAccounts);
    expect(recon.isReconciled).toBe(false);
    expect(recon.totals.leaseLiabilityVariance).toBeCloseTo(5000, 2);
    expect(recon.leaseLiability?.status).toBe('review');
  });
});
