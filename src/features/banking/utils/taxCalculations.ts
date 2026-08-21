import type { TaxRate } from '@/types';

/** Round to 2 decimal places, avoiding classic floating-point drift. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Computes the VAT amount for one split-allocation line, using the shared
 * `TaxRate` model (src/types/taxRate.ts) — never a hardcoded percentage
 * (docs/DO_NOT_BREAK.md "Tax & Accounting Logic").
 *
 * `code === 'NODEDUCT'` (Non-Deductible, docs/SA_ACCOUNTING_MASTER_SPEC.md)
 * is SA-specific: VAT that was charged but may not be claimed back (e.g.
 * client entertainment). It always returns 0 here — the VAT cost is folded
 * into the allocation's net amount instead of posted to a separate VAT
 * account, so the full amount lands on the expense line. See
 * `isTaxSeparatelyPosted` for the GL-posting decision this drives.
 */
export function computeAllocationTax(netAmount: number, taxRate?: TaxRate): number {
  if (!taxRate || taxRate.rate <= 0) return 0;
  if (taxRate.code === 'NODEDUCT') return 0;
  return round2(netAmount * (taxRate.rate / 100));
}

/** True if this line's VAT should post to a separate VAT control account rather than fold into the net amount. */
export function isTaxSeparatelyPosted(taxRate?: TaxRate): boolean {
  return Boolean(taxRate) && taxRate!.rate > 0 && taxRate!.code !== 'NODEDUCT';
}
