import type { BaseEntity, CurrencyCode, ID, ISODateString } from './common';

/** SA_ACCOUNTING_MASTER_SPEC.md §57 employee master data categories. */
export type EmploymentType = 'permanent' | 'fixed_term' | 'part_time' | 'temporary';

/** Drives PAYE/UIF/SDL annualization in payrollCalculations.ts — see periodsPerYear(). */
export type PayFrequency = 'monthly' | 'weekly' | 'biweekly';

export type EmployeeStatus = 'active' | 'inactive' | 'terminated';

/**
 * A recurring per-period allowance (travel, cellphone, housing, etc.).
 * `taxable` is a deliberate simplification of SARS's actual rules — several
 * real SA allowances (a travel allowance especially) are only PARTIALLY
 * taxable under detailed fringe-benefit rules, not a clean 0%/100% split.
 * Modeling that properly needs per-allowance-type legislation lookups this
 * codebase has not verified — see docs/SA_SPEC_GAP_ANALYSIS.md. Every
 * allowance still counts in full toward `grossPay`/net pay; only its
 * PAYE-taxable treatment is simplified.
 */
export interface EmployeeAllowance {
  id: ID;
  label: string;
  amount: number;
  taxable: boolean;
}

/**
 * A recurring per-period deduction (pension/provident fund, medical aid,
 * garnishee order, staff loan repayment, union fee, etc.). `preTax` decides
 * whether it reduces PAYE-taxable income (a real retirement-fund
 * contribution does, up to statutory caps) or only reduces net pay after
 * tax (a garnishee order does not reduce taxable income). This is a
 * simplification of SARS's actual retirement-fund deduction cap (27.5% of
 * remuneration, capped at R350,000/year) — that cap is NOT enforced here,
 * see docs/SA_SPEC_GAP_ANALYSIS.md.
 */
export interface EmployeeDeduction {
  id: ID;
  label: string;
  amount: number;
  preTax: boolean;
}

/**
 * Employee master data record (SA_ACCOUNTING_MASTER_SPEC.md §57/§116 Phase
 * 8 "Employees"). `basicSalary` is the gross basic amount for ONE full pay
 * period matching `payFrequency` (a monthly-paid employee's basicSalary is
 * their monthly salary, not an annual figure) — payrollCalculations.ts
 * annualizes it for PAYE using periodsPerYear(payFrequency).
 */
export interface Employee extends BaseEntity {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  /** SA 13-digit ID number, where applicable (a foreign national may have a passport number instead — not separately modeled, see gap analysis). */
  idNumber?: string;
  /** SARS income tax reference number. */
  taxNumber?: string;
  /** Feeds the age-based secondary (65+) / tertiary (75+) PAYE rebate in payrollCalculations.ts. Rebate defaults to primary-only when omitted. */
  dateOfBirth?: ISODateString;
  email?: string;
  phone?: string;
  employmentType: EmploymentType;
  payFrequency: PayFrequency;
  status: EmployeeStatus;
  startDate: ISODateString;
  terminationDate?: ISODateString;
  basicSalary: number;
  standardAllowances: EmployeeAllowance[];
  standardDeductions: EmployeeDeduction[];
  bankName?: string;
  bankAccountNumber?: string;
  /**
   * True for the small minority of workers the UIF Act actually excludes
   * (e.g. certain company directors, or someone working under 24 hours a
   * month). A simplification of the real exclusion list to a single flag —
   * see docs/SA_SPEC_GAP_ANALYSIS.md.
   */
  uifExempt: boolean;
  currency: CurrencyCode;
}
