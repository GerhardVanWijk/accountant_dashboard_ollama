import type { CurrencyCode } from '@/types';
import { PLACEHOLDER_TAX_RATE_STANDARD, PLACEHOLDER_TAX_RATE_ZERO } from '@/mock-data/products';

/**
 * Reporting currency for inventory valuation/price display. There is no
 * global company-settings/currency module yet, so this is a single named
 * constant (not a value scattered inline across components) — swap for a
 * real settings-driven value once one exists.
 */
export const INVENTORY_CURRENCY: CurrencyCode = 'ZAR';

/**
 * Placeholder tax rate options for the Product form's tax-rate select.
 * There is no TaxRate mock repository yet (Phase 3, tax-bee) — Product.
 * taxRateId is already a free-form optional ID on the base type, so this
 * is just a local id->label lookup for display until that module exists.
 */
export const TAX_RATE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: PLACEHOLDER_TAX_RATE_STANDARD, label: 'Standard Rate (15%)' },
  { id: PLACEHOLDER_TAX_RATE_ZERO, label: 'Zero-Rated (0%)' },
];

export function getTaxRateLabel(taxRateId: string | undefined): string {
  if (!taxRateId) return 'No tax rate';
  return TAX_RATE_OPTIONS.find((t) => t.id === taxRateId)?.label ?? taxRateId;
}

/** Units of measure offered in the Product form's UOM select. */
export const UOM_OPTIONS: readonly string[] = ['EA', 'KG', 'G', 'L', 'ML', 'M', 'CS', 'BOX', 'PK', 'HR'];
