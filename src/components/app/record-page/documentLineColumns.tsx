import type { DocumentLineItem } from '@/types';
import { formatCurrency } from '@/lib/app/format';
import type { DocumentLineColumn } from './DocumentLineTable';

export interface DocumentLineColumnOptions {
  /** Resolve a line's `productId` to its SKU + name, so the item column reads "CON-001 / Black Toner Cartridge" rather than only a description. */
  resolveProduct?: (productId: string | undefined) => { sku: string; name: string } | undefined;
  /** Resolve a line's `taxRateId` to a human label (e.g. "Standard rate — 15%"). Never returns a raw UUID — see getTaxRateLabel. */
  resolveTaxLabel?: (taxRateId: string | undefined) => string;
  /** Drop the leading Item (SKU/name) column — for documents whose lines are never product-linked. */
  hideItem?: boolean;
  /** Drop the Tax rate column (keeps the Tax amount column). */
  hideTaxRate?: boolean;
  /** Header for the final amount column. Defaults to "Line total". */
  totalHeader?: string;
}

/**
 * The single shared column set for every business-document line table
 * (invoice, quote, credit note, sales order, purchase order, bill,
 * supplier return). Consolidates the copy-pasted per-module `<table>` onto
 * DocumentLineTable so a product line always shows its SKU + name, its tax
 * rate, and its tax amount with room to breathe — the cramped-PRODUCT-column
 * complaint from the sheet era. Read presentation only.
 */
export function documentLineColumns<T extends DocumentLineItem>(
  opts: DocumentLineColumnOptions = {},
): DocumentLineColumn<T>[] {
  const { resolveProduct, resolveTaxLabel, hideItem, hideTaxRate, totalHeader = 'Line total' } = opts;
  const columns: DocumentLineColumn<T>[] = [];

  if (!hideItem) {
    columns.push({
      key: 'item',
      header: 'Item',
      className: 'w-[22%] min-w-[160px]',
      cell: (line) => {
        const product = resolveProduct?.(line.productId);
        if (!product) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="flex flex-col">
            <span className="font-medium tabular-nums">{product.sku}</span>
            <span className="text-xs text-muted-foreground">{product.name}</span>
          </span>
        );
      },
    });
  }

  columns.push({
    key: 'description',
    header: 'Description',
    className: 'min-w-[220px]',
    cell: (line) => <span className="[overflow-wrap:anywhere]">{line.description}</span>,
  });
  columns.push({ key: 'qty', header: 'Qty', align: 'right', className: 'w-20', cell: (line) => line.quantity.toFixed(2) });
  columns.push({ key: 'unit', header: 'Unit price', align: 'right', className: 'w-28', cell: (line) => formatCurrency(line.unitPrice) });

  if (!hideTaxRate) {
    columns.push({
      key: 'taxRate',
      header: 'Tax rate',
      align: 'right',
      className: 'w-32',
      cell: (line) => (
        <span className="text-xs text-muted-foreground">{resolveTaxLabel ? resolveTaxLabel(line.taxRateId) : line.taxRateId ? '—' : 'No tax'}</span>
      ),
    });
  }

  columns.push({ key: 'tax', header: 'Tax', align: 'right', className: 'w-24', cell: (line) => formatCurrency(line.taxAmount) });
  columns.push({ key: 'total', header: totalHeader, align: 'right', className: 'w-28', cell: (line) => formatCurrency(line.lineTotal) });

  return columns;
}
