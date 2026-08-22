import type { Employee, PayFrequency, PayrollTaxYearConfig, PayslipLine } from '@/types';

/** Half a cent — same rounding tolerance used across the ledger (journalEntryService.ts). */
const EPSILON = 0.005;

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  monthly: 12,
  weekly: 52,
  biweekly: 26,
};

export function periodsPerYear(payFrequency: PayFrequency): number {
  return PERIODS_PER_YEAR[payFrequency];
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Whole years of age as of `asOf` — used only for the 65+/75+ PAYE rebate tiers. */
export function calculateAge(dateOfBirth: string, asOf: Date): number {
  const dob = new Date(dateOfBirth);
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const hasHadBirthdayThisYear =
    asOf.getUTCMonth() > dob.getUTCMonth() ||
    (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() >= dob.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Annual PAYE on `annualTaxableIncome` per SARS's cumulative "base + rate%
 * of the amount over the bracket's lower bound" table format
 * (PayeBracket, src/types/payroll.ts), less whichever age-based rebate
 * tier applies. Never negative.
 */
export function calculateAnnualPaye(annualTaxableIncome: number, config: PayrollTaxYearConfig, age?: number): number {
  if (annualTaxableIncome <= 0) return 0;

  let tax = 0;
  let lowerBound = 0;
  for (const bracket of config.payeBrackets) {
    const upper = bracket.upTo ?? Infinity;
    if (annualTaxableIncome <= upper) {
      tax = bracket.base + (bracket.rate / 100) * (annualTaxableIncome - lowerBound);
      break;
    }
    lowerBound = upper;
  }

  let rebate = config.primaryRebateAnnual;
  if (age !== undefined && age >= 65) rebate += config.secondaryRebateAnnual;
  if (age !== undefined && age >= 75) rebate += config.tertiaryRebateAnnual;

  return Math.max(0, tax - rebate);
}

/**
 * De-annualized PAYE for one pay period: annualizes `periodTaxableIncome`
 * by `payFrequency` (the "annual equivalent" method), taxes the annual
 * figure, then divides back down. Shared by computePayslipLine() below and
 * any future standalone PAYE preview/calculator UI, so they can never
 * disagree — same principle as depreciationService's
 * calculateMonthlyDepreciation().
 */
export function calculatePeriodPaye(
  periodTaxableIncome: number,
  payFrequency: PayFrequency,
  config: PayrollTaxYearConfig,
  age?: number,
): number {
  const n = periodsPerYear(payFrequency);
  const annualTax = calculateAnnualPaye(periodTaxableIncome * n, config, age);
  return annualTax / n;
}

/** The pay-frequency-prorated UIF ceiling, e.g. a weekly-paid employee's ceiling is the monthly ceiling * 12 / 52. */
function periodUifCeiling(payFrequency: PayFrequency, config: PayrollTaxYearConfig): number {
  return (config.uifMonthlyCeiling * 12) / periodsPerYear(payFrequency);
}

export function calculateUifEmployee(periodGrossPay: number, payFrequency: PayFrequency, config: PayrollTaxYearConfig): number {
  const uifable = Math.min(Math.max(0, periodGrossPay), periodUifCeiling(payFrequency, config));
  return uifable * (config.uifEmployeeRatePercent / 100);
}

export function calculateUifEmployer(periodGrossPay: number, payFrequency: PayFrequency, config: PayrollTaxYearConfig): number {
  const uifable = Math.min(Math.max(0, periodGrossPay), periodUifCeiling(payFrequency, config));
  return uifable * (config.uifEmployerRatePercent / 100);
}

/**
 * SDL on one employee's period gross pay, unless the whole company is
 * flagged exempt (Company.sdlExempt — see its doc comment for why this is
 * a whole-company flag rather than a real trailing-12-month payroll
 * projection against `config.sdlAnnualPayrollExemptionThreshold`).
 */
export function calculateSdl(periodGrossPay: number, config: PayrollTaxYearConfig, companySdlExempt: boolean): number {
  if (companySdlExempt) return 0;
  return Math.max(0, periodGrossPay) * (config.sdlRatePercent / 100);
}

export interface PayslipOverrideInput {
  overtime?: number;
  bonus?: number;
}

/**
 * Computes one employee's full payslip for a period — the ONE calculation
 * path shared by payrollRunService.createPayrollRun(),
 * updatePayslipOverride(), and any future payslip-preview UI. `netPay` is
 * derived as the exact remainder (grossPay - paye - uifEmployee -
 * deductionsTotal), never independently rounded, so summing every
 * employee's lines in a run always balances by construction (see
 * payrollRunService.postPayrollRun()) — same "no separate implementation
 * to drift out of sync" principle as
 * depreciationService.calculateMonthlyDepreciation() and
 * stockLotService's shared FIFO lot-walking algorithm.
 */
export function computePayslipLine(
  employee: Employee,
  config: PayrollTaxYearConfig,
  companySdlExempt: boolean,
  asOf: Date,
  overrides: PayslipOverrideInput = {},
): PayslipLine {
  const overtime = overrides.overtime ?? 0;
  const bonus = overrides.bonus ?? 0;

  const allowancesTotal = employee.standardAllowances.reduce((sum, a) => sum + a.amount, 0);
  const taxableAllowances = employee.standardAllowances.filter((a) => a.taxable).reduce((sum, a) => sum + a.amount, 0);
  const preTaxDeductions = employee.standardDeductions.filter((d) => d.preTax).reduce((sum, d) => sum + d.amount, 0);
  const deductionsTotal = employee.standardDeductions.reduce((sum, d) => sum + d.amount, 0);

  const grossPay = employee.basicSalary + overtime + bonus + allowancesTotal;
  const payeTaxableIncome = Math.max(
    0,
    employee.basicSalary + overtime + bonus + taxableAllowances - preTaxDeductions,
  );

  const age = employee.dateOfBirth ? calculateAge(employee.dateOfBirth, asOf) : undefined;
  const paye = round2(calculatePeriodPaye(payeTaxableIncome, employee.payFrequency, config, age));
  const uifEmployee = employee.uifExempt ? 0 : round2(calculateUifEmployee(grossPay, employee.payFrequency, config));
  const uifEmployer = employee.uifExempt ? 0 : round2(calculateUifEmployer(grossPay, employee.payFrequency, config));
  const sdlEmployer = round2(calculateSdl(grossPay, config, companySdlExempt));

  const netPay = round2(grossPay - paye - uifEmployee - deductionsTotal);

  return {
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    basicSalary: employee.basicSalary,
    overtime,
    bonus,
    allowancesTotal,
    grossPay: round2(grossPay),
    payeTaxableIncome: round2(payeTaxableIncome),
    paye,
    uifEmployee,
    uifEmployer,
    sdlEmployer,
    deductionsTotal: round2(deductionsTotal),
    netPay,
  };
}

export { EPSILON as PAYROLL_EPSILON };
