import type { DividendsWithholdingTaxRateConfig } from '@/types';

/**
 * Seed data for MockDividendsWithholdingTaxConfigRepository
 * (src/features/tax/dividendsTax/repositories/). ONE rate version: the
 * 20% Dividends Withholding Tax rate that has applied to every dividend
 * paid on or after 22 February 2017.
 *
 * VERIFIED 2026-08-22 directly against the live sars.gov.za page (not
 * reconstructed from memory) — see `sourceReference` below. Still not a
 * substitute for professional sign-off (SA_ACCOUNTING_MASTER_SPEC.md
 * §110/§111) — confirm against the current SARS Government Gazette /
 * Income Tax Act s64E before real-world use, and add a new record here
 * (never edit this one in place) if the rate ever changes.
 */
export const seedDividendsWithholdingTaxConfig: DividendsWithholdingTaxRateConfig[] = [
  {
    id: 'dwtc_2017_20pct',
    ratePercent: 20,
    effectiveFrom: '2017-02-22T00:00:00.000Z',
    sourceReference:
      'Verified 2026-08-22 directly against sars.gov.za: "Dividends Tax is a tax ... levied at a rate of 20% ' +
      'on the amount of any dividend paid" — https://www.sars.gov.za/types-of-tax/dividends-tax/ ' +
      '(rate increased from 15% to 20% for any dividend paid on or after 22 February 2017, per the same page). ' +
      'Not a substitute for professional sign-off (SA_ACCOUNTING_MASTER_SPEC.md §110/§111) — confirm against ' +
      'the current SARS Government Gazette / Income Tax Act s64E before real-world use.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
