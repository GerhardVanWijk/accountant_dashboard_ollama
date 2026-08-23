import { describe, it, expect, beforeEach } from 'vitest';
import { DividendDeclarationService } from './dividendDeclarationService';
import { DividendsWithholdingTaxConfigService } from './dividendsWithholdingTaxConfigService';
import { MockDividendDeclarationRepository } from '../repositories/MockDividendDeclarationRepository';
import { MockDividendsWithholdingTaxConfigRepository } from '../repositories/MockDividendsWithholdingTaxConfigRepository';
import { seedDividendsWithholdingTaxConfig } from '@/mock-data/dividendsTaxConfig';
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

function sumDebits(lines: { debit: number; credit: number }[]): number {
  return lines.reduce((sum, l) => sum + l.debit, 0);
}
function sumCredits(lines: { debit: number; credit: number }[]): number {
  return lines.reduce((sum, l) => sum + l.credit, 0);
}

describe('DividendDeclarationService', () => {
  let declarationService: DividendDeclarationService;
  let rateService: DividendsWithholdingTaxConfigService;
  let journalEntryService: JournalEntryService;

  beforeEach(() => {
    const declarationRepository = new MockDividendDeclarationRepository([]);
    const rateRepository = new MockDividendsWithholdingTaxConfigRepository(seedDividendsWithholdingTaxConfig);
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());

    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    rateService = new DividendsWithholdingTaxConfigService(rateRepository);
    declarationService = new DividendDeclarationService(
      declarationRepository,
      journalEntryService,
      rateService,
      new AccountMappingService(new AccountService(accountRepository, journalRepository)),
    );
  });

  describe('withholding math', () => {
    it('computes taxableAmount/dividendsTaxWithheld/netPayableToShareholders with no exemption', async () => {
      const declaration = await declarationService.createDeclaration({
        declarationDate: '2026-03-01',
        totalAmount: 100000,
      });

      expect(declaration.ratePercentApplied).toBe(20);
      expect(declaration.taxableAmount).toBeCloseTo(100000, 2);
      expect(declaration.dividendsTaxWithheld).toBeCloseTo(20000, 2);
      expect(declaration.netPayableToShareholders).toBeCloseTo(80000, 2);
      expect(declaration.status).toBe('draft');
    });

    it('computes withholding only on the non-exempt portion when exemptPortion is set with a reason', async () => {
      const declaration = await declarationService.createDeclaration({
        declarationDate: '2026-03-01',
        totalAmount: 100000,
        exemptPortion: 40000,
        exemptionReason: 'Shareholder is an SA resident company exempt under s64F.',
      });

      expect(declaration.taxableAmount).toBeCloseTo(60000, 2);
      expect(declaration.dividendsTaxWithheld).toBeCloseTo(12000, 2);
      expect(declaration.netPayableToShareholders).toBeCloseTo(88000, 2);
    });

    it('rejects an exempt portion without a reason', async () => {
      await expect(
        declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 100000, exemptPortion: 10000 }),
      ).rejects.toThrow(/exemption reason/i);
    });

    it('rejects an exempt portion greater than the total amount', async () => {
      await expect(
        declarationService.createDeclaration({
          declarationDate: '2026-03-01',
          totalAmount: 100000,
          exemptPortion: 150000,
          exemptionReason: 'test',
        }),
      ).rejects.toThrow(/cannot exceed/i);
    });

    it('rejects a zero or negative total amount', async () => {
      await expect(declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 0 })).rejects.toThrow(
        /greater than 0/i,
      );
    });

    it('rejects a declaration date with no configured Dividends Withholding Tax rate', async () => {
      await expect(
        declarationService.createDeclaration({ declarationDate: '2010-01-01', totalAmount: 1000 }),
      ).rejects.toThrow(/no dividends withholding tax rate/i);
    });
  });

  describe('lifecycle transitions', () => {
    it('declare() posts a balanced entry DR Retained Earnings / CR Dividends Payable for the gross amount', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 50000 });
      const declared = await declarationService.declare(declaration.id);

      expect(declared.status).toBe('declared');
      const entry = await journalEntryService.getEntry(declared.declarationJournalEntryId!);
      expect(entry).toBeDefined();
      expect(sumDebits(entry!.lines)).toBeCloseTo(sumCredits(entry!.lines), 2);
      expect(entry!.lines.find((l) => l.accountId === 'acc_3900')?.debit).toBeCloseTo(50000, 2);
      expect(entry!.lines.find((l) => l.accountId === 'acc_2500')?.credit).toBeCloseTo(50000, 2);
    });

    it('pay() posts one balanced entry DR Dividends Payable / CR Cash and Bank + CR Dividends Tax Payable', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 50000 });
      await declarationService.declare(declaration.id);
      const paid = await declarationService.pay(declaration.id, '2026-03-15');

      expect(paid.status).toBe('paid');
      expect(paid.paidDate).toBe('2026-03-15');
      const entry = await journalEntryService.getEntry(paid.paymentJournalEntryId!);
      expect(sumDebits(entry!.lines)).toBeCloseTo(sumCredits(entry!.lines), 2);
      expect(entry!.lines.find((l) => l.accountId === 'acc_2500')?.debit).toBeCloseTo(50000, 2);
      expect(entry!.lines.find((l) => l.accountId === 'acc_1000')?.credit).toBeCloseTo(40000, 2);
      expect(entry!.lines.find((l) => l.accountId === 'acc_2510')?.credit).toBeCloseTo(10000, 2);
    });

    it('remitToSars() posts a balanced entry DR Dividends Tax Payable / CR Cash and Bank for the withheld amount', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 50000 });
      await declarationService.declare(declaration.id);
      await declarationService.pay(declaration.id, '2026-03-15');
      const remitted = await declarationService.remitToSars(declaration.id, '2026-04-30');

      expect(remitted.status).toBe('remitted');
      const entry = await journalEntryService.getEntry(remitted.remittanceJournalEntryId!);
      expect(sumDebits(entry!.lines)).toBeCloseTo(sumCredits(entry!.lines), 2);
      expect(entry!.lines.find((l) => l.accountId === 'acc_2510')?.debit).toBeCloseTo(10000, 2);
      expect(entry!.lines.find((l) => l.accountId === 'acc_1000')?.credit).toBeCloseTo(10000, 2);
    });

    it('full lifecycle: declare -> pay -> remit each post exactly one journal entry (three total)', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 50000 });
      await declarationService.declare(declaration.id);
      await declarationService.pay(declaration.id, '2026-03-15');
      await declarationService.remitToSars(declaration.id, '2026-04-30');

      const allEntries = await journalEntryService.getEntries();
      expect(allEntries).toHaveLength(3);
    });
  });

  describe('status guards', () => {
    it('rejects declaring a non-draft record', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 1000 });
      await declarationService.declare(declaration.id);
      await expect(declarationService.declare(declaration.id)).rejects.toThrow(/only a draft can be declared/i);
    });

    it('rejects paying a draft (never declared) record', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 1000 });
      await expect(declarationService.pay(declaration.id)).rejects.toThrow(/only a declared dividend can be paid/i);
    });

    it('rejects paying an already-paid record', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 1000 });
      await declarationService.declare(declaration.id);
      await declarationService.pay(declaration.id);
      await expect(declarationService.pay(declaration.id)).rejects.toThrow(/only a declared dividend can be paid/i);
    });

    it('rejects remitting a record that has not been paid yet', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 1000 });
      await declarationService.declare(declaration.id);
      await expect(declarationService.remitToSars(declaration.id)).rejects.toThrow(/only a paid dividend can be remitted/i);
    });

    it('rejects remitting an already-remitted record', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 1000 });
      await declarationService.declare(declaration.id);
      await declarationService.pay(declaration.id);
      await declarationService.remitToSars(declaration.id);
      await expect(declarationService.remitToSars(declaration.id)).rejects.toThrow(/only a paid dividend can be remitted/i);
    });
  });

  describe('draft editing', () => {
    it('updateDraftDeclaration recomputes withholding fields', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 10000 });
      const updated = await declarationService.updateDraftDeclaration(declaration.id, { totalAmount: 20000 });
      expect(updated.taxableAmount).toBeCloseTo(20000, 2);
      expect(updated.dividendsTaxWithheld).toBeCloseTo(4000, 2);
    });

    it('rejects editing a declaration that is no longer a draft', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 10000 });
      await declarationService.declare(declaration.id);
      await expect(declarationService.updateDraftDeclaration(declaration.id, { totalAmount: 5000 })).rejects.toThrow(
        /only a draft can be edited/i,
      );
    });

    it('deleteDraftDeclaration removes a draft, but rejects a non-draft', async () => {
      const declaration = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 10000 });
      await declarationService.deleteDraftDeclaration(declaration.id);
      expect(await declarationService.getDeclaration(declaration.id)).toBeUndefined();

      const other = await declarationService.createDeclaration({ declarationDate: '2026-03-01', totalAmount: 10000 });
      await declarationService.declare(other.id);
      await expect(declarationService.deleteDraftDeclaration(other.id)).rejects.toThrow(/only a draft can be deleted/i);
    });
  });
});
