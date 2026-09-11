import type { TaxRate } from '@/types';

/**
 * The version of `code` in effect on `asOf` — pure mirror of
 * `TaxRateService.getEffectiveRate()`, for client-side use where calling the
 * service is not worth it (e.g. a form preview). Same rule: `effectiveFrom`
 * on or before `asOf`, and `effectiveTo` absent or after it.
 */
export function resolveEffectiveTaxRate(rates: TaxRate[], code: string, asOf: Date): TaxRate | undefined {
  const iso = asOf.toISOString();
  return rates
    .filter((r) => r.code === code && r.isActive)
    .filter((r) => r.effectiveFrom <= iso && (!r.effectiveTo || r.effectiveTo >= iso))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
