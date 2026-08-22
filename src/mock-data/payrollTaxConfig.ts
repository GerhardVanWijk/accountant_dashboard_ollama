import type { PayrollTaxYearConfig } from '@/types';

/**
 * Seed data for MockPayrollTaxConfigRepository
 * (src/features/employees/repositories/). ONE SARS tax year's payroll
 * statutory configuration, covering this app's current 2026/2027 SARS tax
 * year (1 March 2026 - 28 February 2027 — see getSarsTaxYear.ts) — see
 * PayrollTaxYearConfig's doc comment (src/types/payroll.ts) for the full
 * verification caveat. In short: the actual bracket/rebate/UIF/SDL FIGURES
 * below are reconstructed from general training knowledge of a recent
 * published SA individual tax year, reused here as a stand-in for the real
 * 2026/2027 SARS tax tables (which this codebase has not been given and
 * has not looked up) — NOT independently verified against any official
 * SARS Tax Guide/Government Gazette. Confirm every value with a registered
 * tax practitioner and replace with the real published figures before
 * relying on this for real payroll (SA_ACCOUNTING_MASTER_SPEC.md
 * §110/§111).
 */
export const seedPayrollTaxConfig: PayrollTaxYearConfig[] = [
  {
    id: 'ptc_2026_2027',
    taxYearLabel: '2026/2027',
    taxYearStart: '2026-03-01T00:00:00.000Z',
    taxYearEnd: '2027-02-28T23:59:59.999Z',
    payeBrackets: [
      { upTo: 237100, rate: 18, base: 0 },
      { upTo: 370500, rate: 26, base: 42678 },
      { upTo: 512800, rate: 31, base: 77362 },
      { upTo: 673000, rate: 36, base: 121475 },
      { upTo: 857900, rate: 39, base: 179147 },
      { upTo: 1817000, rate: 41, base: 251258 },
      { upTo: null, rate: 45, base: 644489 },
    ],
    primaryRebateAnnual: 17235,
    secondaryRebateAnnual: 9444,
    tertiaryRebateAnnual: 3145,
    uifEmployeeRatePercent: 1,
    uifEmployerRatePercent: 1,
    uifMonthlyCeiling: 17712,
    sdlRatePercent: 1,
    sdlAnnualPayrollExemptionThreshold: 500000,
    sourceReference:
      'Placeholder for this app\'s current (2026/2027) SARS tax year: figures carried over from general training knowledge of a recent published SA individual tax year (brackets/rebates, UIF monthly remuneration ceiling effective 1 June 2021, SDL Act rate/threshold) — NOT the actual published 2026/2027 SARS tax tables, and NOT independently verified against any official SARS Tax Guide/Government Gazette. Replace with the real published 2026/2027 figures and get professional/accounting sign-off before any real-payroll use.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
