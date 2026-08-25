import type { TaxRate } from '@/types';

/**
 * Per-line financial calculation shared by every document that uses
 * `DocumentLineItem` (Quote/SalesOrder/Invoice/CreditNote/Bill/
 * PurchaseOrder) — extracted out of `LineItemsEditor.tsx` (the pre-v0
 * component still used unmodified by Quote/SalesOrder forms) so both it
 * and the new v0-styled `SalesLineItemsEditor.tsx` (Invoice/CreditNote)
 * call exactly the same formula instead of maintaining two copies. Pure
 * relocation, not new logic — behavior is byte-identical to before.
 */
export function computeLine(
  quantity: number,
  unitPrice: number,
  taxRateId: string | undefined,
  taxRates: TaxRate[],
): { lineTotal: number; taxAmount: number } {
  const lineTotal = quantity * unitPrice;
  const rate = taxRates.find((r) => r.id === taxRateId);
  const taxAmount = rate ? lineTotal * (rate.rate / 100) : 0;
  return { lineTotal, taxAmount };
}
