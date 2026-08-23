import { describe, expect, it } from 'vitest';
import type { Employee } from '@/types';
import { calculateAverageEmployeeCount } from './calculateAverageEmployeeCount';

function employee(overrides: Partial<Employee> & Pick<Employee, 'id' | 'startDate'>): Employee {
  return {
    employeeNumber: 'EMP-0000',
    firstName: 'Test',
    lastName: 'Employee',
    employmentType: 'permanent',
    payFrequency: 'monthly',
    status: 'active',
    basicSalary: 20000,
    standardAllowances: [],
    standardDeductions: [],
    uifExempt: false,
    currency: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('calculateAverageEmployeeCount', () => {
  it('averages monthly headcount across a full financial year', () => {
    const employees: Employee[] = [
      employee({ id: 'e1', startDate: '2020-01-01' }), // present all year
      employee({ id: 'e2', startDate: '2026-07-01' }), // joins mid-year (July onward, 6 of 12 months)
    ];
    const periodStart = new Date('2026-01-01T00:00:00.000Z');
    const periodEnd = new Date('2026-12-31T23:59:59.999Z');

    const average = calculateAverageEmployeeCount(employees, periodStart, periodEnd);

    // e1 present all 12 months (12), e2 present July-Dec (6) => 18 employee-months / 12 months
    expect(average).toBeCloseTo(18 / 12, 5);
  });

  it('excludes an employee once terminated before the period starts', () => {
    const employees: Employee[] = [employee({ id: 'e1', startDate: '2020-01-01', terminationDate: '2025-12-31' })];
    const periodStart = new Date('2026-01-01T00:00:00.000Z');
    const periodEnd = new Date('2026-12-31T23:59:59.999Z');

    expect(calculateAverageEmployeeCount(employees, periodStart, periodEnd)).toBe(0);
  });

  it('counts an employee terminated partway through the period for the months they overlapped', () => {
    const employees: Employee[] = [employee({ id: 'e1', startDate: '2020-01-01', terminationDate: '2026-03-15' })];
    const periodStart = new Date('2026-01-01T00:00:00.000Z');
    const periodEnd = new Date('2026-12-31T23:59:59.999Z');

    // Jan, Feb, Mar overlap (terminated mid-March) => 3 employee-months / 12 months
    expect(calculateAverageEmployeeCount(employees, periodStart, periodEnd)).toBeCloseTo(3 / 12, 5);
  });

  it('returns 0 for an empty employee list', () => {
    expect(calculateAverageEmployeeCount([], new Date('2026-01-01'), new Date('2026-12-31'))).toBe(0);
  });
});
