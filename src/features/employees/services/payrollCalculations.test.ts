import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  calculateAnnualPaye,
  calculatePeriodPaye,
  calculateSdl,
  calculateUifEmployee,
  calculateUifEmployer,
  computePayslipLine,
} from './payrollCalculations';
import { seedPayrollTaxConfig } from '@/mock-data/payrollTaxConfig';
import type { Employee } from '@/types';

const config = seedPayrollTaxConfig[0];

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp_test',
    employeeNumber: 'EMP-TEST',
    firstName: 'Test',
    lastName: 'Employee',
    employmentType: 'permanent',
    payFrequency: 'monthly',
    status: 'active',
    startDate: '2026-01-01',
    basicSalary: 25000,
    standardAllowances: [],
    standardDeductions: [],
    uifExempt: false,
    currency: 'ZAR',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('calculateAge', () => {
  it('counts a full year only once the birthday has passed', () => {
    expect(calculateAge('1960-06-15', new Date('2026-06-14T00:00:00Z'))).toBe(65);
    expect(calculateAge('1960-06-15', new Date('2026-06-15T00:00:00Z'))).toBe(66);
  });
});

describe('calculateAnnualPaye', () => {
  // Bracket boundaries/rates/bases are read from the seeded config, not
  // hardcoded here, so these tests stay correct across a future
  // re-verification against a new SARS tax year's real published figures.
  const [firstBracket, secondBracket] = config.payeBrackets;
  const topBracket = config.payeBrackets[config.payeBrackets.length - 1];

  it('taxes the first bracket at its flat rate, less the primary rebate', () => {
    const income = firstBracket.upTo! / 2;
    const expectedTax = (firstBracket.rate / 100) * income;
    expect(calculateAnnualPaye(income, config)).toBeCloseTo(expectedTax - config.primaryRebateAnnual, 2);
  });

  it('applies the cumulative base + rate for a higher bracket', () => {
    const income = firstBracket.upTo! + 1000;
    const expectedTax = secondBracket.base + (secondBracket.rate / 100) * (income - firstBracket.upTo!);
    expect(calculateAnnualPaye(income, config)).toBeCloseTo(expectedTax - config.primaryRebateAnnual, 2);
  });

  it('taxes the unbounded top bracket', () => {
    const lowerBound = config.payeBrackets[config.payeBrackets.length - 2].upTo!;
    const income = lowerBound + 500000;
    const expectedTax = topBracket.base + (topBracket.rate / 100) * (income - lowerBound);
    expect(calculateAnnualPaye(income, config)).toBeCloseTo(expectedTax - config.primaryRebateAnnual, 2);
  });

  it('never goes negative when the rebate exceeds the tax', () => {
    expect(calculateAnnualPaye(50000, config)).toBe(0);
  });

  it('stacks the secondary (65+) rebate on top of the primary', () => {
    const income = firstBracket.upTo! + 1000;
    const tax = secondBracket.base + (secondBracket.rate / 100) * (income - firstBracket.upTo!);
    const expected = Math.max(0, tax - config.primaryRebateAnnual - config.secondaryRebateAnnual);
    expect(calculateAnnualPaye(income, config, 70)).toBeCloseTo(expected, 2);
  });

  it('returns 0 for zero or negative income', () => {
    expect(calculateAnnualPaye(0, config)).toBe(0);
    expect(calculateAnnualPaye(-100, config)).toBe(0);
  });
});

describe('calculatePeriodPaye', () => {
  it('annualizes a monthly income, taxes it, then de-annualizes', () => {
    const annualIncome = 25000 * 12;
    const annualTax = calculateAnnualPaye(annualIncome, config);
    expect(calculatePeriodPaye(25000, 'monthly', config)).toBeCloseTo(annualTax / 12, 2);
  });

  it('annualizes a weekly income by 52', () => {
    const annualIncome = 5000 * 52;
    const annualTax = calculateAnnualPaye(annualIncome, config);
    expect(calculatePeriodPaye(5000, 'weekly', config)).toBeCloseTo(annualTax / 52, 2);
  });
});

describe('calculateUifEmployee / calculateUifEmployer', () => {
  it('applies the rate below the monthly ceiling', () => {
    expect(calculateUifEmployee(10000, 'monthly', config)).toBeCloseTo(100, 2);
    expect(calculateUifEmployer(10000, 'monthly', config)).toBeCloseTo(100, 2);
  });

  it('caps contributions at the monthly ceiling', () => {
    expect(calculateUifEmployee(50000, 'monthly', config)).toBeCloseTo(config.uifMonthlyCeiling * 0.01, 2);
  });

  it('pro-rates the ceiling for a weekly pay frequency', () => {
    const weeklyCeiling = (config.uifMonthlyCeiling * 12) / 52;
    expect(calculateUifEmployee(weeklyCeiling * 2, 'weekly', config)).toBeCloseTo(weeklyCeiling * 0.01, 2);
  });
});

describe('calculateSdl', () => {
  it('applies the rate when the company is not exempt', () => {
    expect(calculateSdl(20000, config, false)).toBeCloseTo(200, 2);
  });

  it('is zero when the company is flagged SDL-exempt', () => {
    expect(calculateSdl(20000, config, true)).toBe(0);
  });
});

describe('computePayslipLine', () => {
  it('defines netPay as the exact remainder — gross = paye + uifEmployee + deductions + netPay', () => {
    const employee = makeEmployee({
      basicSalary: 38000,
      standardAllowances: [{ id: 'a1', label: 'Travel', amount: 4000, taxable: true }],
      standardDeductions: [{ id: 'd1', label: 'Pension', amount: 2280, preTax: true }],
    });
    const line = computePayslipLine(employee, config, false, new Date('2026-06-15'));
    expect(line.grossPay).toBeCloseTo(42000, 2);
    expect(line.grossPay - line.paye - line.uifEmployee - line.deductionsTotal).toBeCloseTo(line.netPay, 2);
  });

  it('excludes a non-taxable allowance from payeTaxableIncome but still counts it in grossPay', () => {
    const employee = makeEmployee({
      basicSalary: 20000,
      standardAllowances: [{ id: 'a1', label: 'Tool Allowance', amount: 1000, taxable: false }],
    });
    const line = computePayslipLine(employee, config, false, new Date('2026-06-15'));
    expect(line.grossPay).toBeCloseTo(21000, 2);
    expect(line.payeTaxableIncome).toBeCloseTo(20000, 2);
  });

  it('zeroes UIF for a uifExempt employee', () => {
    const employee = makeEmployee({ uifExempt: true });
    const line = computePayslipLine(employee, config, false, new Date('2026-06-15'));
    expect(line.uifEmployee).toBe(0);
    expect(line.uifEmployer).toBe(0);
  });

  it('applies overtime/bonus overrides on top of the standard salary', () => {
    const employee = makeEmployee({ basicSalary: 20000 });
    const line = computePayslipLine(employee, config, false, new Date('2026-06-15'), { overtime: 500, bonus: 1000 });
    expect(line.grossPay).toBeCloseTo(21500, 2);
    expect(line.overtime).toBe(500);
    expect(line.bonus).toBe(1000);
  });
});
