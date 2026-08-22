import type { IncomeTaxYearConfig } from '@/types';

/**
 * Seed data for MockIncomeTaxConfigRepository
 * (src/features/tax/incomeTax/repositories/). ONE SARS tax year's
 * corporate income tax configuration — the flat rate (§52) and SBC
 * brackets (§53), which SARS publishes together on the same page for the
 * same "years of assessment ending [date]–[date]" window.
 *
 * VERIFIED 2026-08-22, fetched live from sars.gov.za (not reconstructed
 * from memory) — same citation discipline as
 * src/mock-data/payrollTaxConfig.ts. Still not a substitute for
 * professional sign-off (SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — web
 * sources can change, and this was not cross-checked against a physical
 * Government Gazette. Re-verify for any later year of assessment.
 */
export const seedIncomeTaxConfig: IncomeTaxYearConfig[] = [
  {
    id: 'itc_2026_2027',
    taxYearLabel: '2026/2027',
    // sars.gov.za/tax-rates/income-tax/companies-trusts-and-small-business-corporations-sbc/
    // (fetched 2026-08-22): "for years of assessment ending on any date
    // between 1 April 2026 and 31 March 2027" — this app's seeded FY2026
    // (ends 2026-12-31) falls inside this window.
    effectiveFrom: '2026-04-01T00:00:00.000Z',
    effectiveTo: '2027-03-31T23:59:59.999Z',
    // Same page: standard company rate, 27%.
    corporateTaxRatePercent: 27,
    // Same page, SBC table for the 2026/27 year of assessment:
    sbcBrackets: [
      { lowerBound: 0, upperBound: 99000, appliesAboveAmount: 0, baseAmount: 0, marginalRatePercent: 0 },
      { lowerBound: 99001, upperBound: 365000, appliesAboveAmount: 99000, baseAmount: 0, marginalRatePercent: 7 },
      { lowerBound: 365001, upperBound: 550000, appliesAboveAmount: 365000, baseAmount: 18620, marginalRatePercent: 21 },
      { lowerBound: 550001, upperBound: null, appliesAboveAmount: 550000, baseAmount: 57470, marginalRatePercent: 27 },
    ],
    sourceReference:
      'Verified 2026-08-22 directly against sars.gov.za: ' +
      'https://www.sars.gov.za/tax-rates/income-tax/companies-trusts-and-small-business-corporations-sbc/ ' +
      '(years of assessment ending 1 April 2026 - 31 March 2027: standard company rate 27%; SBC brackets ' +
      'R0-R99,000 0%, R99,001-R365,000 7% above R99,000, R365,001-R550,000 R18,620 + 21% above R365,000, ' +
      'R550,001+ R57,470 + 27% above R550,000). Not a substitute for professional sign-off ' +
      '(SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — confirm against the current SARS Government Gazette before ' +
      'real-filing use, and re-verify for any later year of assessment. SBC eligibility itself is NOT ' +
      'determined by this config — see Company.isSbcEligible\'s doc comment (src/types/company.ts): ' +
      'shareholder composition, personal-service-company classification, and ownership-in-other-companies ' +
      'restrictions (§53) are not modeled anywhere in this app and must be confirmed by an accountant.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
