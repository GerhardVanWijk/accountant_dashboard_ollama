import { describe, expect, it, beforeEach } from 'vitest';
import { PayrollRunService } from './payrollRunService';
import { PayrollTaxConfigService } from './payrollTaxConfigService';
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

    service = new PayrollRunService(
      runRepository,
      {
        getActiveEmployees: async () => employees.filter((e) => e.status === 'active'),
        getEmployee: async (id) => employees.find((e) => e.id === id),
      },
      taxConfigService,
      { getCompanies: async () => companies },
      journalEntryService,
      new AccountMappingService(new AccountService(accountRepository, journalRepository)),
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
    await service.postPayrollRun(run.id, 'acc_1000');
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
      const posted = await service.postPayrollRun(run.id, 'acc_1000');

      expect(posted.status).toBe('posted');
      expect(posted.journalEntryId).toBeDefined();
      expect(posted.contraAccountId).toBe('acc_1000');

      const entry = await journalEntryService.getEntry(posted.journalEntryId!);
      const totalDebit = entry!.lines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredit = entry!.lines.reduce((sum, l) => sum + l.credit, 0);
      expect(totalDebit).toBeCloseTo(totalCredit, 2);

      const trialBalance = await journalEntryService.computeTrialBalance();
      expect(trialBalance.balanced).toBe(true);
    });

    it('posts PAYE/UIF/SDL to their own separate liability accounts, not combined', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      const posted = await service.postPayrollRun(run.id, 'acc_1000');
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
      await service.postPayrollRun(run.id, 'acc_1000');
      await expect(service.postPayrollRun(run.id, 'acc_1000')).rejects.toThrow(/already been posted/);
    });

    it('rejects editing a posted run', async () => {
      const run = await service.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
      await service.postPayrollRun(run.id, 'acc_1000');
      await expect(service.updatePayslipOverride(run.id, 'emp_1', { overtime: 100 })).rejects.toThrow(/already been posted/);
    });
  });
});
