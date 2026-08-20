import type { CurrencyCode } from '@/types';

/**
 * Formats a numeric amount as currency. The currency code is always a
 * caller-supplied parameter — per docs/DO_NOT_BREAK.md, currencies must
 * never be hardcoded.
 */
export function formatCurrency(amount: number, currency: CurrencyCode, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
