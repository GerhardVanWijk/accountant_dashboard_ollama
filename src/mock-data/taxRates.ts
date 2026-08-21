import type { TaxRate } from '@/types';

/**
 * SA VAT rate options (docs/SA_ACCOUNTING_MASTER_SPEC.md) used by the
 * Banking module's split-allocation lines. There is no TaxRate
 * repository/service in this codebase yet (that's Tax module / a future
 * "tax-bee" wave) — this is seed reference data only, the same
 * local-lookup-until-a-real-module-exists pattern Inventory used for
 * TAX_RATE_OPTIONS (src/features/inventory/constants.ts), but typed against
 * the real shared `TaxRate` model rather than a bespoke shape, per this
 * dispatch's instruction not to invent a parallel tax model.
 *
 * `code: 'NODEDUCT'` is SA-specific: input VAT that may NOT be claimed back
 * (e.g. client entertainment, some staff welfare spend) — see
 * src/features/banking/utils/taxCalculations.ts for how that code changes
 * GL posting (folded into the expense line rather than a separate VAT input
 * account).
 */
export const seedTaxRates: TaxRate[] = [
  {
    id: 'tax_std_15',
    code: 'STD',
    name: 'Standard Rate (15%)',
    rate: 15,
    appliesTo: 'both',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_zero',
    code: 'ZERO',
    name: 'Zero-Rated (0%)',
    rate: 0,
    appliesTo: 'both',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_exempt',
    code: 'EXEMPT',
    name: 'Exempt',
    rate: 0,
    appliesTo: 'both',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tax_nondeductible',
    code: 'NODEDUCT',
    name: 'Non-Deductible VAT (15%)',
    rate: 15,
    appliesTo: 'purchases',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
