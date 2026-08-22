import type { PayrollTaxYearConfig } from '@/types';

/**
 * Seed data for MockPayrollTaxConfigRepository
 * (src/features/employees/repositories/). ONE SARS tax year's payroll
 * statutory configuration, covering this app's current 2026/2027 SARS tax
 * year (1 March 2026 - 28 February 2027 — see getSarsTaxYear.ts).
 *
 * VERIFIED 2026-08-22 directly against the live sars.gov.za pages (not
 * reconstructed from memory) — see each field's line comment below for the
 * specific page. Two independent fetches of the individual tax rate table
 * (a live page fetch and the 2026 Budget tax guide PDF's search summary)
 * agreed exactly. This replaces an earlier placeholder that was
 * Claude-reconstructed from general training knowledge and flagged as
 * unverified — see docs/KNOWN_ISSUES.md's Resolved section for that
 * history. Still not a substitute for professional sign-off
 * (SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — web sources can change, and
 * this was not cross-checked against a physical Government Gazette — but
 * every figure below now traces to SARS's own published page as of the
 * date noted, not an unsourced guess.
 */
export const seedPayrollTaxConfig: PayrollTaxYearConfig[] = [
  {
    id: 'ptc_2026_2027',
    taxYearLabel: '2026/2027',
    taxYearStart: '2026-03-01T00:00:00.000Z',
    taxYearEnd: '2027-02-28T23:59:59.999Z',
    // sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/ (fetched 2026-08-22),
    // "Rates of tax for individuals ... 1 March 2026 to 28 February 2027":
    payeBrackets: [
      { upTo: 245100, rate: 18, base: 0 },
      { upTo: 383100, rate: 26, base: 44118 },
      { upTo: 530200, rate: 31, base: 79998 },
      { upTo: 695800, rate: 36, base: 125599 },
      { upTo: 887000, rate: 39, base: 185215 },
      { upTo: 1878600, rate: 41, base: 259783 },
      { upTo: null, rate: 45, base: 666339 },
    ],
    // Same page, "Tax Rebates" for the 2027 tax year.
    primaryRebateAnnual: 17820,
    secondaryRebateAnnual: 9765,
    tertiaryRebateAnnual: 3249,
    // sars.gov.za/types-of-tax/unemployment-insurance-fund/ (fetched 2026-08-22):
    // employee 1% + employer 1%; ceiling R17,712/month (R212,544/year),
    // unchanged since the Government Gazette notice of 28 May 2021 (effective 1 June 2021).
    uifEmployeeRatePercent: 1,
    uifEmployerRatePercent: 1,
    uifMonthlyCeiling: 17712,
    // sars.gov.za/types-of-tax/skills-development-levy/ (fetched 2026-08-22):
    // 1% of total salaries paid; exempt while projected 12-month payroll <= R500,000.
    sdlRatePercent: 1,
    sdlAnnualPayrollExemptionThreshold: 500000,
    sourceReference:
      'Verified 2026-08-22 directly against sars.gov.za: PAYE brackets/rebates from ' +
      'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/ (2026/2027 tax year, ' +
      '1 March 2026 - 28 February 2027); UIF rate/ceiling from ' +
      'https://www.sars.gov.za/types-of-tax/unemployment-insurance-fund/; SDL rate/threshold from ' +
      'https://www.sars.gov.za/types-of-tax/skills-development-levy/. Not a substitute for professional ' +
      'sign-off (SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — confirm against the current SARS Government ' +
      'Gazette before real-payroll use, and re-verify for any later tax year.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
