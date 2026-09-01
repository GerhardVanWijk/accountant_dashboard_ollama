import { useEffect, useState } from 'react';
import { ChevronDownIcon, PrinterIcon } from 'lucide-react';
import type { Product, StockTake, StockTakeLine, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { ExportMenu } from '@/features/export/components/ExportMenu';
import { PrintableReport } from '@/features/export/components/PrintableReport';
import type { ExportColumn, ExportDataset } from '@/features/export/types';

export interface StockTakeCountSheetExportProps {
  stockTake: StockTake;
  products: Product[];
  warehouses: Warehouse[];
  allowed: boolean;
}

type CountSheetMode = 'blind' | 'standard';

const BLANK_WRITE_IN = '________';

/**
 * The Phase-5 "Print Count Sheet" placeholder, implemented (Phase 7 spec
 * §13–14). Two distinct outputs, gated on `stockTake.status`:
 *
 *   - `counting`: a physical count sheet, print-only (no CSV/XLSX — it's
 *     a form to fill in, not data to extract). Blind mode omits Expected
 *     Qty entirely so a counter can't anchor to it; Standard mode shows
 *     it. Neither mode ever shows unit cost — spec: "Do not expose
 *     WAC/cost on physical count sheets unless explicitly appropriate."
 *   - `ready_for_review` / `posted`: the full variance result, offered
 *     through the normal shared `ExportMenu` (Print/CSV/XLSX) — WAC and
 *     variance value ARE shown here, since this is a completed review
 *     document, not a blank form. A `posted` take is immutable; this is
 *     read-only regardless.
 */
export function StockTakeCountSheetExport({ stockTake, products, warehouses, allowed }: StockTakeCountSheetExportProps) {
  const [printRequest, setPrintRequest] = useState<{ mode: CountSheetMode; at: number } | null>(null);

  useEffect(() => {
    if (printRequest) window.print();
  }, [printRequest]);

  if (!allowed) return null;

  const productSku = (id: string) => products.find((p) => p.id === id)?.sku ?? id;
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

  if (stockTake.status === 'counting') {
    const mode = printRequest?.mode ?? 'standard';
    const columns: ExportColumn<StockTakeLine>[] = [
      { key: 'sku', header: 'SKU', accessor: (l) => productSku(l.productId) },
      { key: 'product', header: 'Product', accessor: (l) => productName(l.productId) },
      ...(mode === 'standard' ? [{ key: 'expected', header: 'Expected Qty', accessor: (l: StockTakeLine) => l.expectedQty, align: 'right' as const }] : []),
      { key: 'counted', header: 'Counted Qty', accessor: () => null, formatForPrint: () => BLANK_WRITE_IN, align: 'right' },
      { key: 'notes', header: 'Notes', accessor: () => null, formatForPrint: () => '' },
    ];
    const dataset: ExportDataset<StockTakeLine> = {
      title: `Count Sheet — ${stockTake.stockTakeNumber}`,
      subtitle: mode === 'blind' ? 'Blind count — expected quantity withheld' : 'Standard count',
      filters: [{ label: 'Warehouse', value: warehouseName(stockTake.warehouseId) }],
      columns,
      rows: stockTake.lineItems,
      filename: `stock-take-${stockTake.stockTakeNumber}-count-sheet`,
    };

    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={stockTake.lineItems.length === 0} />}>
            <PrinterIcon data-icon="inline-start" />
            Print Count Sheet
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setPrintRequest({ mode: 'blind', at: Date.now() })}>Blind Count Sheet</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPrintRequest({ mode: 'standard', at: Date.now() })}>Standard Count Sheet</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <PrintableReport dataset={dataset} className="hidden print:block" />
      </>
    );
  }

  if (stockTake.status === 'ready_for_review' || stockTake.status === 'posted') {
    const resultColumns: ExportColumn<StockTakeLine>[] = [
      { key: 'sku', header: 'SKU', accessor: (l) => productSku(l.productId) },
      { key: 'product', header: 'Product', accessor: (l) => productName(l.productId) },
      { key: 'expected', header: 'Expected', accessor: (l) => l.expectedQty, align: 'right' },
      { key: 'counted', header: 'Counted', accessor: (l) => l.countedQty ?? null, align: 'right' },
      { key: 'variance', header: 'Variance', accessor: (l) => l.varianceQty, align: 'right' },
      { key: 'wac', header: 'Frozen WAC', accessor: (l) => l.unitCost, align: 'right' },
      {
        key: 'varianceValue',
        header: 'Variance Value',
        accessor: (l) => l.varianceValue,
        align: 'right',
        total: (rows) => rows.reduce((sum, l) => sum + l.varianceValue, 0),
      },
      { key: 'reason', header: 'Reason', accessor: (l) => l.reason ?? null },
    ];
    const resultDataset: ExportDataset<StockTakeLine> = {
      title: `Stock Take Result — ${stockTake.stockTakeNumber}`,
      subtitle: warehouseName(stockTake.warehouseId),
      columns: resultColumns,
      rows: stockTake.lineItems,
      filename: `stock-take-${stockTake.stockTakeNumber}-result`,
    };

    return (
      <>
        <ExportMenu dataset={resultDataset} allowed={allowed} />
        <PrintableReport dataset={resultDataset} className="hidden print:block" />
      </>
    );
  }

  return null;
}
