import type { ProductCategory } from '@/types';
import type { StockOnHandRow } from './buildStockOnHandRows';

export interface CategoryAnalysisRow {
  categoryName: string;
  itemCount: number;
  units: number;
  inventoryValue: number;
  /** 0–100, share of the TOTAL inventory value passed in (usually every tracked product/warehouse in the company, not just this category). */
  percentOfInventoryValue: number;
}

/**
 * Per-category STOCK/VALUE rollup only (spec §12 classification C for the
 * sales/COGS/margin columns) — deliberately does NOT include Sales, COGS or
 * Gross Margin. Neither `InvoiceLineItem` nor `BillLineItem` carries a
 * `productId` anywhere in this schema (verified against
 * `src/types/invoice.ts` / `src/types/bill.ts` during the Phase 8 audit —
 * see docs/INVENTORY_REPORTS.md), so a category's historical sales/COGS
 * cannot be attributed to specific products without matching on free text —
 * exactly what spec §12 forbids. If that relationship is added later, a
 * sales/margin column becomes a real B-classification addition to this same
 * builder; it is not silently faked in the meantime.
 */
export function buildCategoryAnalysisRows(stockOnHandRows: StockOnHandRow[], categories: ProductCategory[]): CategoryAnalysisRow[] {
  const totalValue = stockOnHandRows.reduce((sum, r) => sum + r.inventoryValue, 0);
  const knownNames = new Set(categories.map((c) => c.name));
  const byCategory = new Map<string, { itemCount: number; units: number; inventoryValue: number }>();

  for (const row of stockOnHandRows) {
    const name = knownNames.has(row.categoryName) ? row.categoryName : row.categoryName === '—' ? 'Uncategorised' : row.categoryName;
    const bucket = byCategory.get(name) ?? { itemCount: 0, units: 0, inventoryValue: 0 };
    bucket.itemCount += 1;
    bucket.units += row.onHand;
    bucket.inventoryValue += row.inventoryValue;
    byCategory.set(name, bucket);
  }

  return [...byCategory.entries()]
    .map(([categoryName, b]) => ({
      categoryName,
      ...b,
      percentOfInventoryValue: totalValue > 0 ? (b.inventoryValue / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.inventoryValue - a.inventoryValue);
}
