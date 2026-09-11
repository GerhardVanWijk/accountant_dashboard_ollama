import { describe, expect, it, beforeEach } from 'vitest';
import { PayrollRunService } from './payrollRunService';
import { PayrollTaxConfigService } from './payrollTaxConfigService';
import { FakePayrollRunPostingExecutor } from './payrollRunPostingExecutor';
import { FakePayrollRunCorrectionExecutor } from './payrollRunCorrectionExecutor';
import type { PayrollSettlementExecutor } from './payrollSettlementExecutor';

/** Not exercised by this file — settlement has its own dedicated adversarial suite in payrollSettlementExecutor.test.ts. */
const unusedSettlementExecutor: PayrollSettlementExecutor = {
  settle: async () => {
    throw new Error('settlement not exercised in this test file');
  },
};
import { MockPayrollRunRepository } from '../repositories/MockPayrollRunRepository';
import { MockPayrollTaxConfigRepository } from '../repositories/MockPayrollTaxConfigRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
import { AccountService } from '@/features/accounting/services/accountService';
import { AccountMappingService } from '@/features/accounting/services/accountMappingService';
import { MockJournalEntryRepository } from '@/features/accounting/repositories/MockJournalEntryRepository';
import { MockAccountRepository } from '@/features/accounting/repositories/MockAccountRepository';
import { MockAccountingPeriodRepository } from '@/features/accounting/repositories/MockAccountingPeriodRepository';
import { AuditLogService } from '@/services/auditLogService';
import { MockAuditLogRepository } from '@/repositories/mock/MockAuditLogRepository';
import { seedAccounts } from '@/mock-data/accounts';
import { seedPayrollTaxConfig } from '@/mock-data/payrollTaxConfig';
import type { AccountingPeriod, Company, Employee } from '@/types';

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

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id ?? 'emp_1',
    employeeNumber: overrides.employeeNumber ?? 'EMP-0001',
    firstName: 'Test',
    lastName: 'Employee',
    employmentType: 'permanent',
    payFrequency: 'monthly',
    status: 'active',
    startDate: '2026-01-01',
    basicSalary: 20000,
    standardAllowances: [],
    standardDeductions: [{ id: 'd1', label: 'Garnishee', amount: 500, preTax: false }],
    uifExempt: false,
    currency: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PayrollRunService', () => {
  let runRepository: MockPayrollRunRepository;
  let journalEntryService: JournalEntryService;
  let taxConfigService: PayrollTaxConfigService;
  let service: PayrollRunService;
  let employees: Employee[];
  let companies: Company[];

  beforeEach(() => {
    runRepository = new MockPayrollRunRepository();
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    taxConfigService = new PayrollTaxConfigService(new MockPayrollTaxConfigRepository(seedPayrollTaxConfig));

    employees = [makeEmployee({ id: 'emp_1', employeeNumber: 'EMP-0001' }), makeEmployee({ id: 'emp_2', employeeNumber: 'EMP-0002', basicSalary: 35000 })];
    companies = [{ sdlExempt: false } as Company];

    const postingExecutor = new FakePayrollRunPostingExecutor({
      journal: journalEntryService,
      runs: runRepository,
      accounts: { getType: async (id) => (await accountRepository.getById(id))?.type },
    });
    const correctionExecutor = new FakePayrollRunCorrectionExecutor({ journal: journalEntryService, runs: runRepository });

    service = new PayrollRunService(
      runRepository,
      {
        getActiveEmployees: async () => employees.filter((e) => e.status === 'active'),
        getEmployee: async (id) => employees.find((e) => e.id === id),
      },
      taxConfigService,
      { getCompanies: async () => companies },
      postingExecutor,
      new AccountMappingService(new AccountService(accountRepository, journalRepository)),
      correctionExecutor,
      unusedSettlementExecutor,
    );
  });

  it('creates a draft run with one payslip line per active employee', async () => {
    const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    expect(run.status).toBe('draft');
    expect(run.payslips).toHaveLength(2);
    expect(run.runNumber).toBe('PR-0001');
  });

  it('excludes inactive/terminated employees from a new run', async () => {
    employees.push(makeEmployee({ id: 'emp_3', employeeNumber: 'EMP-0003', status: 'terminated' }));
    const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    expect(run.payslips.map((p) => p.employeeId)).not.toContain('emp_3');
  });

  it('rejects a pay period that overlaps an existing run', async () => {
    await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    await expect(service.createPayrollRun('2026-06-15', '2026-07-15', '2026-07-10')).rejects.toThrow(/already covers/);
  });

  it('rejects when no employees are active', async () => {
    employees = [];
    await expect(service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25')).rejects.toThrow(/No active employees/);
  });

  it('rejects when no tax config covers the pay date', async () => {
    await expect(service.createPayrollRun('2030-06-01', '2030-06-30', '2030-06-25')).rejects.toThrow(/No payroll tax configuration/);
  });

  it('recomputes a line through updatePayslipOverride, never hand-edited', async () => {
    const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    const before = run.payslips.find((p) => p.employeeId === 'emp_1')!;
    const updated = await service.updatePayslipOverride(run.id, 'emp_1', { overtime: 1000, bonus: 0 });
    const line = updated.payslips.find((p) => p.employeeId === 'emp_1')!;
    expect(line.grossPay).toBeCloseTo(before.grossPay + 1000, 2);
    expect(line.grossPay - line.paye - line.uifEmployee - line.deductionsTotal).toBeCloseTo(line.netPay, 2);
  });

  it('rejects deleting a posted run', async () => {
    const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    await service.postPayrollRun(run.id, 'acc_2250');
    await expect(service.deletePayrollRun(run.id)).rejects.toThrow(/already posted/);
  });

  it('deletes a draft run', async () => {
    const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    await service.deletePayrollRun(run.id);
    expect(await runRepository.getById(run.id)).toBeUndefined();
  });

  describe('postPayrollRun', () => {
    it('posts one combined, balanced journal entry and flips the run to posted', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      const posted = await service.postPayrollRun(run.id, 'acc_2250');

      expect(posted.status).toBe('posted');
      expect(posted.journalEntryId).toBeDefined();
      expect(posted.contraAccountId).toBe('acc_2250');

      const entry = await journalEntryService.getEntry(posted.journalEntryId!);
      const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit, 2);

      const trialBalance = await journalEntryService.computeTrialBalance();
      expect(trialBalance.balanced).toBe(true);
    });

    it('posts PAYE/UIF/SDL to their own separate liability accounts, not combined', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      const posted = await service.postPayrollRun(run.id, 'acc_2250');
      const entry = await journalEntryService.getEntry(posted.journalEntryId!);

      const accountIds = new Set(entry!.lines.map((l) => l.accountId));
      expect(accountIds).toContain('acc_2200'); // PAYE Payable
      expect(accountIds).toContain('acc_2210'); // UIF Payable - Employee
      expect(accountIds).toContain('acc_2220'); // UIF Payable - Employer
      expect(accountIds).toContain('acc_2230'); // SDL Payable
      expect(accountIds).toContain('acc_2240'); // Other Payroll Deductions Payable (garnishee)
      expect(accountIds).toContain('acc_5400'); // Salaries and Wages Expense
    });

    it('rejects posting an already-posted run', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await service.postPayrollRun(run.id, 'acc_2250');
      await expect(service.postPayrollRun(run.id, 'acc_2250')).rejects.toThrow(/already been posted/);
    });

    it('rejects editing a posted run', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await service.postPayrollRun(run.id, 'acc_2250');
      await expect(service.updatePayslipOverride(run.id, 'emp_1', { overtime: 100 })).rejects.toThrow(/already been posted/);
    });

    // Leases + Payroll integrity audit, PART 3 (Banking fix) — a payroll
    // run must never credit Cash and Bank directly, so the real EFT
    // disbursement (captured later through Banking against the SAME
    // clearing account) can never double-count the same cash movement.
    it('rejects Cash and Bank as the contra account — net pay must clear through a liability/clearing account', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await expect(service.postPayrollRun(run.id, 'acc_1000')).rejects.toThrow(/liability\/clearing account/);
    });

    it('refuses to post into a locked accounting period', async () => {
      // Leases + Payroll integrity audit, item 7: "locked periods remain
      // protected" — a fresh harness with a LOCKED period covering the pay
      // date, standing in for the real accounting_periods.status = 'locked'
      // check the atomic RPC (post_payroll_run, migration 0091) performs
      // before posting anything.
      const localRunRepository = new MockPayrollRunRepository();
      const localJournalRepository = new MockJournalEntryRepository([]);
      const localAccountRepository = new MockAccountRepository(seedAccounts);
      const lockedPeriodRepository = new MockAccountingPeriodRepository([{ ...makeOpenPeriod(), status: 'locked' }]);
      const localAuditLog = new AuditLogService(new MockAuditLogRepository());
      const localJournalEntryService = new JournalEntryService(localJournalRepository, localAccountRepository, lockedPeriodRepository, localAuditLog);
      const localTaxConfigService = new PayrollTaxConfigService(new MockPayrollTaxConfigRepository(seedPayrollTaxConfig));
      const localPostingExecutor = new FakePayrollRunPostingExecutor({
        journal: localJournalEntryService,
        runs: localRunRepository,
        accounts: { getType: async (id) => (await localAccountRepository.getById(id))?.type },
      });
      const localCorrectionExecutor = new FakePayrollRunCorrectionExecutor({ journal: localJournalEntryService, runs: localRunRepository });
      const localService = new PayrollRunService(
        localRunRepository,
        {
          getActiveEmployees: async () => employees.filter((e) => e.status === 'active'),
          getEmployee: async (id) => employees.find((e) => e.id === id),
        },
        localTaxConfigService,
        { getCompanies: async () => companies },
        localPostingExecutor,
        new AccountMappingService(new AccountService(localAccountRepository, localJournalRepository)),
        localCorrectionExecutor,
        unusedSettlementExecutor,
      );

      const run = await localService.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await expect(localService.postPayrollRun(run.id, 'acc_2250')).rejects.toThrow(/not open/);

      const stillDraft = await localRunRepository.getById(run.id);
      expect(stillDraft!.status).toBe('draft');
    });

    it('never leaves more than one journal on the books for a run no matter how many times posting is attempted', async () => {
      // Belt-and-braces: the TS-level "already posted" guard is the first
      // line of defense (asserted above); this confirms the observable
      // side-effect the atomic RPC's own idempotency log (migration 0091's
      // payroll_run_posting_log, keyed on the run's own id — no separate
      // caller token needed, since a run posts at most once ever) exists
      // to guarantee in production: exactly one journal, always.
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      const first = await service.postPayrollRun(run.id, 'acc_2250');
      for (let i = 0; i < 3; i += 1) {
        await expect(service.postPayrollRun(run.id, 'acc_2250')).rejects.toThrow(/already been posted/);
      }
      const allEntries = await journalEntryService.getEntries();
      expect(allEntries.filter((e) => e.source === 'payroll')).toHaveLength(1);
      expect(allEntries.filter((e) => e.id === first.journalEntryId)).toHaveLength(1);
    });
  });

  describe('reversePayrollRun', () => {
    it('reverses a posted run with the exact mathematical inverse of the original journal, leaving the original untouched', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      const posted = await service.postPayrollRun(run.id, 'acc_2250');
      const originalEntry = await journalEntryService.getEntry(posted.journalEntryId!);

      const reversed = await service.reversePayrollRun(run.id, 'Overtime miscalculated for EMP-0001', '2026-06-26');

      expect(reversed.status).toBe('posted'); // never mutated — the original posting stands
      expect(reversed.journalEntryId).toBe(posted.journalEntryId);
      expect(reversed.payslips).toEqual(posted.payslips);
      expect(reversed.reversedAt).toBeDefined();
      expect(reversed.reversalJournalEntryId).toBeDefined();
      expect(reversed.reversalReason).toBe('Overtime miscalculated for EMP-0001');

      const stillThere = await journalEntryService.getEntry(posted.journalEntryId!);
      expect(stillThere).toEqual(originalEntry); // original journal is untouched, never deleted or edited

      const reversalEntry = await journalEntryService.getEntry(reversed.reversalJournalEntryId!);
      expect(reversalEntry!.lines).toHaveLength(originalEntry!.lines.length);
      for (const originalLine of originalEntry!.lines) {
        const mirror = reversalEntry!.lines.find((l) => l.accountId === originalLine.accountId)!;
        expect(mirror.debit).toBeCloseTo(originalLine.credit, 2);
        expect(mirror.credit).toBeCloseTo(originalLine.debit, 2);
      }
      const trialBalance = await journalEntryService.computeTrialBalance();
      expect(trialBalance.balanced).toBe(true);
    });

    it('rejects reversing a draft run', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await expect(service.reversePayrollRun(run.id, 'test', '2026-06-26')).rejects.toThrow(/not posted/);
    });

    it('rejects reversing the same run twice', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await service.postPayrollRun(run.id, 'acc_2250');
      await service.reversePayrollRun(run.id, 'first correction', '2026-06-26');
      await expect(service.reversePayrollRun(run.id, 'second attempt', '2026-06-27')).rejects.toThrow(/already been reversed/);
    });

    it('requires a reason', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await service.postPayrollRun(run.id, 'acc_2250');
      await expect(service.reversePayrollRun(run.id, '', '2026-06-26')).rejects.toThrow(/reason/);
    });

    it('frees the pay period for a genuine corrected re-run once reversed', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await service.postPayrollRun(run.id, 'acc_2250');
      await service.reversePayrollRun(run.id, 'redo with correct overtime', '2026-06-26');

      // Before the reversal this would have thrown /already covers/ — the
      // whole point of a payroll-owned correction workflow (audit item 5)
      // is that a reversed run's period becomes available again.
      const correctedRun = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-27');
      expect(correctedRun.status).toBe('draft');
      expect(correctedRun.id).not.toBe(run.id);
    });
  });
});
