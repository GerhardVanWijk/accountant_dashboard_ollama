import type { CurrencyCode } from '@/types';

/**
 * Formats a numeric amount as currency for on-screen display. The currency
 * code is always a caller-supplied parameter — per docs/DO_NOT_BREAK.md,
 * currencies must never be hardcoded.
 *
 * The locale defaults to South African English (`en-ZA`), the app's home
 * locale, so a rand amount displays as `R 21 107,10` — the local convention —
 * rather than `en-US`'s `ZAR 21,107.10`, which spelled out the ISO code and
 * ate horizontal space in every table, tile and drawer. A genuinely foreign
 * amount still renders with its own symbol (`US$1 234,50`, `€1 234,50`), so
 * the currency stays identified. This is display formatting only — where a
 * screen must show the ISO identifier itself (a currency picker, a
 * "Currency: ZAR" field, an FX pair, a raw export) it renders the
 * `CurrencyCode` string directly and does not go through this helper.
 */
export function formatCurrency(amount: number, currency: CurrencyCode, locale = 'en-ZA'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
