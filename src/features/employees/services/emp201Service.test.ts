import { describe, expect, it, beforeEach } from 'vitest';
import { computeEmp201Report, reconcilePayrollLiabilities } from './emp201Service';
import { computeEmp501Report } from './emp501Service';
import { getSarsTaxYear } from '../utils/sarsTaxYear';
import { PayrollRunService } from './payrollRunService';
import { PayrollTaxConfigService } from './payrollTaxConfigService';
import { MockPayrollRunRepository } from '../repositories/MockPayrollRunRepository';
import { MockPayrollTaxConfigRepository } from '../repositories/MockPayrollTaxConfigRepository';
import { JournalEntryService } from '@/features/accounting/services/journalEntryService';
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

describe('EMP201/EMP501 reporting — integration against a real posted payroll run', () => {
  let runService: PayrollRunService;
  let journalEntryService: JournalEntryService;
  let employees: Employee[];

  beforeEach(() => {
    const runRepository = new MockPayrollRunRepository();
    const journalRepository = new MockJournalEntryRepository([]);
    const accountRepository = new MockAccountRepository(seedAccounts);
    const periodRepository = new MockAccountingPeriodRepository([makeOpenPeriod()]);
    const auditLog = new AuditLogService(new MockAuditLogRepository());
    journalEntryService = new JournalEntryService(journalRepository, accountRepository, periodRepository, auditLog);
    const taxConfigService = new PayrollTaxConfigService(new MockPayrollTaxConfigRepository(seedPayrollTaxConfig));

    employees = [
      {
        id: 'emp_1',
        employeeNumber: 'EMP-0001',
        firstName: 'A',
        lastName: 'One',
        employmentType: 'permanent',
        payFrequency: 'monthly',
        status: 'active',
        startDate: '2026-01-01',
        basicSalary: 30000,
        standardAllowances: [],
        standardDeductions: [],
        uifExempt: false,
        currency: 'ZAR',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    runService = new PayrollRunService(
      runRepository,
      {
        getActiveEmployees: async () => employees,
        getEmployee: async (id) => employees.find((e) => e.id === id),
      },
      taxConfigService,
      { getCompanies: async () => [{ sdlExempt: false } as Company] },
      journalEntryService,
    );
  });

  it('computeEmp201Report matches a real posted run, and reconcilePayrollLiabilities finds zero variance', async () => {
    const draft = await runService.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    await runService.postPayrollRun(draft.id, 'acc_1000');

    const runs = await runService.getPayrollRuns();
    const periodStart = new Date('2026-06-01T00:00:00.000Z');
    const periodEnd = new Date('2026-06-30T23:59:59.999Z');

    const report = computeEmp201Report(periodStart, periodEnd, runs);
    expect(report.runCount).toBe(1);
    expect(report.employeeCount).toBe(1);
    expect(report.statutoryLiability).toBeCloseTo(report.paye + report.totalUif + report.sdl, 2);

    const reconciliation = await reconcilePayrollLiabilities(journalEntryService, periodStart, periodEnd, report);
    expect(reconciliation.paye.isReconciled).toBe(true);
    expect(reconciliation.uifEmployee.isReconciled).toBe(true);
    expect(reconciliation.uifEmployer.isReconciled).toBe(true);
    expect(reconciliation.sdl.isReconciled).toBe(true);
  });

  it('excludes a draft (unposted) run from the report', async () => {
    await runService.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    const runs = await runService.getPayrollRuns();
    const report = computeEmp201Report(new Date('2026-06-01'), new Date('2026-06-30T23:59:59.999Z'), runs);
    expect(report.runCount).toBe(0);
    expect(report.statutoryLiability).toBe(0);
  });

  it('computeEmp501Report rolls up the same posted run into its month', async () => {
    const draft = await runService.createPayrollRun('2026-06-01', '2026-06-30', '2026-06-25');
    await runService.postPayrollRun(draft.id, 'acc_1000');

    const runs = await runService.getPayrollRuns();
    const taxYear = getSarsTaxYear(new Date('2026-06-15T00:00:00.000Z'));
    const emp501 = computeEmp501Report(taxYear, runs);

    expect(emp501.months).toHaveLength(12);
    const juneRow = emp501.months.find((m) => m.monthStart.startsWith('2026-06'));
    expect(juneRow).toBeDefined();
    expect(juneRow!.runCount).toBe(1);
    expect(emp501.totals.statutoryLiability).toBeCloseTo(juneRow!.statutoryLiability, 2);
  });
});
