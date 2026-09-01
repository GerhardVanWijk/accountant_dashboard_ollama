import type { CurrencyCode, StockMovement, TaxRate } from '@/types';

/** Human-readable label for every stock movement type. */
export const MOVEMENT_TYPE_LABELS: Record<StockMovement['type'], string> = {
  goods_received: 'Goods received',
  sale: 'Sale',
  sales_return: 'Sales return',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Adjustment',
  opening: 'Opening stock',
  purchase_return: 'Purchase return',
  write_off: 'Write-off',
  stock_gain: 'Stock gain',
  stock_take: 'Stock take',
  correction: 'Correction',
};

/**
 * Reporting currency for inventory valuation/price display. There is no
 * global company-settings/currency module yet, so this is a single named
 * constant (not a value scattered inline across components) — swap for a
 * real settings-driven value once one exists.
 */
export const INVENTORY_CURRENCY: CurrencyCode = 'ZAR';

/**
 * Resolves a Product's taxRateId to a human-readable TaxRate label — e.g.
 * "Standard rate — 15%". Takes the caller's already-loaded tax rates (via
 * useAllTaxRates(), src/features/tax/) rather than a static local list.
 *
 * A raw UUID is NEVER returned as a user-facing label: an id that doesn't
 * resolve (rates still loading, or a rate that was deleted) shows
 * "Unknown tax rate" instead. Callers that want the underlying id for a
 * debug tooltip can read `product.taxRateId` directly.
 */
export function getTaxRateLabel(taxRateId: string | undefined, taxRates: TaxRate[]): string {
  if (!taxRateId) return 'No tax rate';
  const rate = taxRates.find((t) => t.id === taxRateId);
  if (!rate) return 'Unknown tax rate';
  return Number.isFinite(rate.rate) ? `${rate.name} — ${rate.rate}%` : rate.name;
}

/** Units of measure offered in the Product form's UOM select. */
export const UOM_OPTIONS: readonly string[] = ['EA', 'KG', 'G', 'L', 'ML', 'M', 'CS', 'BOX', 'PK', 'HR'];
