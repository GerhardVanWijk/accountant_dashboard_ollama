import type { CgtAnnualExclusionConfig, CgtInclusionRateConfig } from '@/types';

/**
 * Seed data for MockCgtInclusionRateConfigRepository /
 * MockCgtAnnualExclusionConfigRepository
 * (src/features/tax/capitalGains/repositories/). Covers this app's
 * current 2026/2027 SARS tax year (1 March 2026 - 28 February 2027),
 * mirroring src/mock-data/payrollTaxConfig.ts's "one record per SARS
 * tax year" pattern.
 *
 * VERIFIED 2026-08-22 directly against the live sars.gov.za pages named
 * in each sourceReference below (not reconstructed from memory). Still
 * not a substitute for professional sign-off
 * (SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — confirm against the current
 * SARS Government Gazette / a qualified tax practitioner before relying
 * on these figures for a real return, and re-verify for any later tax
 * year.
 */

const TAX_YEAR_START = '2026-03-01T00:00:00.000Z';
const TAX_YEAR_END = '2027-02-28T23:59:59.999Z';

const INCLUSION_RATE_SOURCE =
  'Verified 2026-08-22 directly against ' +
  'https://www.sars.gov.za/types-of-tax/capital-gains-tax/proceeds/calculation-of-taxable-capital-gains-and-assessed-capital-losses/inclusion-rate/ ' +
  '— natural persons (and this app\'s sole-proprietor/partnership simplification, see CgtEntityTypeBucket) 40%; ' +
  'companies 80%; standard trusts 80% (the special-trust 40% sub-case on the same page is NOT modeled here — ' +
  'no special-trust flag exists on Company). Not a substitute for professional sign-off ' +
  '(SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — confirm against the current SARS Government Gazette.';

const ANNUAL_EXCLUSION_SOURCE =
  'Verified 2026-08-22 directly against https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/ ' +
  '— R50,000 annual exclusion for natural persons for the 2026/2027 tax year; the R2,000,000 primary-residence ' +
  'exclusion on the same page is out of scope (every disposal in this app is a business FixedAsset, never an ' +
  'individual\'s home). Companies and trusts get NO annual exclusion per the same source. Not a substitute for ' +
  'professional sign-off (SA_ACCOUNTING_MASTER_SPEC.md §110/§111).';

export const seedCgtInclusionRateConfigs: CgtInclusionRateConfig[] = [
  {
    id: 'cgt_incl_natural_2026_2027',
    entityTypeBucket: 'natural_person_like',
    inclusionRatePercent: 40,
    effectiveFrom: TAX_YEAR_START,
    effectiveTo: TAX_YEAR_END,
    sourceReference: INCLUSION_RATE_SOURCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cgt_incl_company_2026_2027',
    entityTypeBucket: 'company',
    inclusionRatePercent: 80,
    effectiveFrom: TAX_YEAR_START,
    effectiveTo: TAX_YEAR_END,
    sourceReference: INCLUSION_RATE_SOURCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cgt_incl_trust_2026_2027',
    entityTypeBucket: 'trust',
    inclusionRatePercent: 80,
    effectiveFrom: TAX_YEAR_START,
    effectiveTo: TAX_YEAR_END,
    sourceReference: INCLUSION_RATE_SOURCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const seedCgtAnnualExclusionConfigs: CgtAnnualExclusionConfig[] = [
  {
    id: 'cgt_excl_2026_2027',
    amount: 50000,
    effectiveFrom: TAX_YEAR_START,
    effectiveTo: TAX_YEAR_END,
    sourceReference: ANNUAL_EXCLUSION_SOURCE,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
