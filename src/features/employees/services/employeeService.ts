import type { Employee, ID, PayrollRun } from '@/types';
import type { IEmployeeRepository } from '../repositories/IEmployeeRepository';

export type CreateEmployeeDTO = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateEmployeeDTO = Partial<CreateEmployeeDTO>;

/** Minimal surface of the payroll-run store this service needs for the delete guard below. */
export interface PayrollRunStore {
  getAll(): Promise<Pick<PayrollRun, 'payslips'>[]>;
}

/**
 * Employee master data (SA_ACCOUNTING_MASTER_SPEC.md §116 Phase 8
 * "Employees"). Mirrors productService.ts's plain-CRUD shape — an employee
 * record itself has no draft/posted lifecycle of its own (a PayrollRun's
 * payslip lines do, see payrollRunService.ts).
 */
export class EmployeeService {
  constructor(
    private readonly repository: IEmployeeRepository,
    private readonly payrollRunStore: PayrollRunStore,
  ) {}

  async getEmployees(): Promise<Employee[]> {
    return this.repository.getAll();
  }

  async getActiveEmployees(): Promise<Employee[]> {
    const all = await this.repository.getAll();
    return all.filter((e) => e.status === 'active');
  }

  async getEmployee(id: ID): Promise<Employee | undefined> {
    return this.repository.getById(id);
  }

  async createEmployee(data: CreateEmployeeDTO): Promise<Employee> {
    if (!data.firstName.trim() || !data.lastName.trim()) {
      throw new Error('Employee first and last name are required.');
    }
    if (data.basicSalary < 0) {
      throw new Error('Basic salary cannot be negative.');
    }
    const now = new Date().toISOString();
    return this.repository.create({ ...data, id: '', createdAt: now, updatedAt: now });
  }

  async updateEmployee(id: ID, patch: UpdateEmployeeDTO): Promise<Employee> {
    if (patch.basicSalary !== undefined && patch.basicSalary < 0) {
      throw new Error('Basic salary cannot be negative.');
    }
    return this.repository.update(id, patch);
  }

  /**
   * An employee referenced by any payroll run's payslip lines (draft or
   * posted — a draft run's numbers were computed FROM this employee's
   * data, deleting them mid-review would silently orphan the line) can
   * never be deleted — same posted/referenced-record guard class as the 8
   * services covered in docs/KNOWN_ISSUES.md. Set status to 'terminated'
   * instead, which is what real SA payroll practice does anyway (an
   * ex-employee's record must be retained for IRP5/tax-certificate and
   * SARS record-keeping purposes, §61).
   */
  async deleteEmployee(id: ID): Promise<void> {
    const employee = await this.repository.getById(id);
    if (!employee) {
      throw new Error(`Employee "${id}" not found.`);
    }
    const runs = await this.payrollRunStore.getAll();
    const hasPayslips = runs.some((run) => run.payslips.some((p) => p.employeeId === id));
    if (hasPayslips) {
      throw new Error(
        `Cannot delete "${employee.employeeNumber} - ${employee.firstName} ${employee.lastName}": referenced by an existing payroll run. Set status to "terminated" instead.`,
      );
    }
    return this.repository.delete(id);
  }
}
