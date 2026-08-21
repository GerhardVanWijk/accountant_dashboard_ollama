import type { TaxRate } from '@/types';

/**
 * Seed VAT tax codes (SA_ACCOUNTING_MASTER_SPEC.md §9/§12). Every rate is
 * effective-dated and versioned — see `TaxRateService`
 * (src/features/tax/services/taxRateService.ts) for how a rate change
 * becomes a NEW record rather than an edit to an existing one.
 *
 * IMPORTANT — not independently verified: the 14% -> 15% change on
 * 2018-04-01 is included to give the effective-dating mechanism a real
 * historical case to resolve correctly, and the "current" 15% standard
 * rate matches what the user-supplied master spec states as of August
 * 2026 — but per SA_ACCOUNTING_MASTER_SPEC.md §110/§111, none of these
 * dates or percentages have been independently verified against SARS/the
 * VAT Act by this codebase. Treat every `sourceReference` below as
 * "user-supplied, pending professional/accounting review", not confirmed.
 */
export const seedTaxRates: TaxRate[] = [
  {
    id: 'tax_std_v1',
    code: 'STD',
    name: 'Standard Rate (14%)',
    treatment: 'standard_rated',
    rate: 14,
    appliesTo: 'both',
    effectiveFrom: '2010-01-01T00:00:00.000Z',
    effectiveTo: '2018-03-31T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'VAT Act 89 of 1991 (user-supplied — pending professional verification)',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_std_v2',
    code: 'STD',
    name: 'Standard Rate (15%)',
    treatment: 'standard_rated',
    rate: 15,
    appliesTo: 'both',
    effectiveFrom: '2018-04-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'SA_ACCOUNTING_MASTER_SPEC.md §9 (user-supplied, "as at August 2026") — pending professional verification',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_zero',
    code: 'ZERO',
    name: 'Zero-Rated (0%)',
    treatment: 'zero_rated',
    rate: 0,
    appliesTo: 'both',
    effectiveFrom: '2010-01-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'VAT Act 89 of 1991 (user-supplied — pending professional verification)',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_exempt',
    code: 'EXEMPT',
    name: 'Exempt',
    treatment: 'exempt',
    rate: 0,
    appliesTo: 'both',
    effectiveFrom: '2010-01-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'VAT Act 89 of 1991 (user-supplied — pending professional verification)',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_oos',
    code: 'OOS',
    name: 'Out of Scope',
    treatment: 'out_of_scope',
    rate: 0,
    appliesTo: 'both',
    effectiveFrom: '2010-01-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'SA_ACCOUNTING_MASTER_SPEC.md §12 (user-supplied — pending professional verification)',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_nondeductible',
    code: 'NODEDUCT',
    name: 'Non-Deductible VAT (15%)',
    treatment: 'non_deductible',
    rate: 15,
    appliesTo: 'purchases',
    effectiveFrom: '2018-04-01T00:00:00.000Z',
    jurisdiction: 'ZA',
    sourceReference: 'SA_ACCOUNTING_MASTER_SPEC.md §12 (user-supplied — pending professional verification)',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Convenience: the tax code ids most seed Product/Invoice/Bill records already reference. */
export const STANDARD_RATE_ID = 'tax_std_v2';
export const ZERO_RATE_ID = 'tax_zero';
