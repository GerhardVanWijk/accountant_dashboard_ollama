import type { CurrencyCode, TaxRate } from '@/types';

/**
 * Reporting currency for inventory valuation/price display. There is no
 * global company-settings/currency module yet, so this is a single named
 * constant (not a value scattered inline across components) — swap for a
 * real settings-driven value once one exists.
 */
export const INVENTORY_CURRENCY: CurrencyCode = 'ZAR';

/**
 * Resolves a Product's taxRateId to a real TaxRate's display name. Takes
 * the caller's already-loaded tax rates (via useTaxRates(), Phase 5 —
 * src/features/tax/) rather than a static local list, since Product.
 * taxRateId now resolves against real TaxRate records
 * (src/mock-data/taxRates.ts).
 */
export function getTaxRateLabel(taxRateId: string | undefined, taxRates: TaxRate[]): string {
  if (!taxRateId) return 'No tax rate';
  return taxRates.find((t) => t.id === taxRateId)?.name ?? taxRateId;
}

/** Units of measure offered in the Product form's UOM select. */
export const UOM_OPTIONS: readonly string[] = ['EA', 'KG', 'G', 'L', 'ML', 'M', 'CS', 'BOX', 'PK', 'HR'];
