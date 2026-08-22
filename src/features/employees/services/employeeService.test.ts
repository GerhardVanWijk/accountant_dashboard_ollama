import { describe, expect, it, beforeEach } from 'vitest';
import { EmployeeService } from './employeeService';
import { MockEmployeeRepository } from '../repositories/MockEmployeeRepository';
import type { CreateEmployeeDTO } from './employeeService';
import type { PayrollRun } from '@/types';

function makeEmployeeDTO(overrides: Partial<CreateEmployeeDTO> = {}): CreateEmployeeDTO {
  return {
    employeeNumber: 'EMP-X',
    firstName: 'Test',
    lastName: 'Person',
    employmentType: 'permanent',
    payFrequency: 'monthly',
    status: 'active',
    startDate: '2026-01-01',
    basicSalary: 20000,
    standardAllowances: [],
    standardDeductions: [],
    uifExempt: false,
    currency: 'ZAR',
    ...overrides,
  };
}

describe('EmployeeService', () => {
  let repository: MockEmployeeRepository;
  let payrollRuns: PayrollRun[];
  let service: EmployeeService;

  beforeEach(() => {
    repository = new MockEmployeeRepository([]);
    payrollRuns = [];
    service = new EmployeeService(repository, { getAll: async () => payrollRuns });
  });

  it('creates an employee', async () => {
    const created = await service.createEmployee(makeEmployeeDTO());
    expect(created.id).toBeTruthy();
    expect(created.employeeNumber).toBe('EMP-X');
  });

  it('rejects a negative basic salary on create', async () => {
    await expect(service.createEmployee(makeEmployeeDTO({ basicSalary: -1 }))).rejects.toThrow(/negative/);
  });

  it('rejects a negative basic salary on update', async () => {
    const created = await service.createEmployee(makeEmployeeDTO());
    await expect(service.updateEmployee(created.id, { basicSalary: -5 })).rejects.toThrow(/negative/);
  });

  it('deletes an employee with no payroll history', async () => {
    const created = await service.createEmployee(makeEmployeeDTO());
    await service.deleteEmployee(created.id);
    expect(await repository.getById(created.id)).toBeUndefined();
  });

  it('refuses to delete an employee referenced by a payroll run payslip', async () => {
    const created = await service.createEmployee(makeEmployeeDTO());
    payrollRuns = [
      {
        id: 'pr_1',
        runNumber: 'PR-0001',
        payPeriodStart: '2026-01-01',
        payPeriodEnd: '2026-01-31',
        payDate: '2026-01-31',
        status: 'draft',
        payslips: [
          {
            employeeId: created.id,
            employeeNumber: created.employeeNumber,
            employeeName: 'Test Person',
            basicSalary: 20000,
            overtime: 0,
            bonus: 0,
            allowancesTotal: 0,
            grossPay: 20000,
            payeTaxableIncome: 20000,
            paye: 500,
            uifEmployee: 177.12,
            uifEmployer: 177.12,
            sdlEmployer: 200,
            deductionsTotal: 0,
            netPay: 19322.88,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    await expect(service.deleteEmployee(created.id)).rejects.toThrow(/referenced by an existing payroll run/);
  });
});
