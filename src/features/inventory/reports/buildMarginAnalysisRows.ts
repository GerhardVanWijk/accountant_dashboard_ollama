import type { Product } from '@/types';

export interface MarginAnalysisRow {
  product: Product;
  sellingPrice: number;
  /** `Product.costPrice` — today's weighted-average cost, NOT a historical cost at time of any specific sale. */
  currentWac: number;
  unitMargin: number;
  /** `null` when `sellingPrice` is 0 — a margin percentage against a zero price is undefined, never shown as 0% or ∞. */
  marginPercent: number | null;
}

/**
 * CURRENT THEORETICAL margin per product (spec §15) —
 * `unitMargin = sellingPrice − currentWac`,
 * `marginPercent = unitMargin / sellingPrice × 100`. This is what the NEXT
 * unit sold today would theoretically earn at today's list price and
 * today's WAC. It is explicitly NOT realised historical gross margin: doing
 * that honestly needs each sale's actual product + actual COGS at the time
 * of that sale, and — per the Phase 8 audit — `InvoiceLineItem` carries no
 * `productId` anywhere in this schema, so no historical sale can be
 * attributed to a product without matching on free text (forbidden by spec
 * §12/§15 alike). Every consumer of this builder must keep the "current
 * theoretical" label attached — see `docs/INVENTORY_REPORTS.md` §15.
 */
export function buildMarginAnalysisRows(products: Product[]): MarginAnalysisRow[] {
  return products
    .filter((p) => p.type === 'good')
    .map((product) => {
      const unitMargin = product.unitPrice - product.costPrice;
      const marginPercent = product.unitPrice > 0 ? (unitMargin / product.unitPrice) * 100 : null;
      return { product, sellingPrice: product.unitPrice, currentWac: product.costPrice, unitMargin, marginPercent };
    });
}
