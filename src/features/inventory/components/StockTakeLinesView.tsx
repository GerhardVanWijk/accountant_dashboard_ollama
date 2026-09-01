import { useState } from 'react';
import type { Product, StockTakeLine, Warehouse } from '@/types';
import { Amount } from '@/components/app/figure';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import type { StockTakeCountInput } from '../services/stockTakeService';

export interface StockTakeLinesViewProps {
  lines: StockTakeLine[];
  products: Product[];
  warehouses: Warehouse[];
  /** When set, `countedQty` renders as an input and "Save counts" posts every change through `enterCounts()`. */
  onSaveCounts?: (counts: StockTakeCountInput[]) => Promise<void>;
}

/**
 * The frozen count sheet — read-only (expected/counted/variance) once
 * posted or ready for review, editable while `counting`. Counts are held
 * in local state and only sent to `stockTakeService.enterCounts()` on
 * "Save counts", so a half-finished count session never partially posts.
 */
export function StockTakeLinesView({ lines, products, warehouses, onSaveCounts }: StockTakeLinesViewProps) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const editable = Boolean(onSaveCounts);

  const countedFor = (line: StockTakeLine) => (line.id in edits ? edits[line.id] : (line.countedQty?.toString() ?? ''));
  const dirty = Object.keys(edits).length > 0;

  async function saveCounts() {
    if (!onSaveCounts) return;
    setSaving(true);
    try {
      await onSaveCounts(
        Object.entries(edits).map(([lineId, value]) => ({ lineId, countedQty: parseFloat(value) || 0 })),
      );
      setEdits({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Product</th>
              <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Warehouse</th>
              <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Expected</th>
              <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Counted</th>
              <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Variance</th>
              <th className="px-4 py-2 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">Variance value</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{productName(line.productId)}</td>
                <td className="px-4 py-2">{warehouseName(line.warehouseId)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{line.expectedQty}</td>
                <td className="px-4 py-2 text-right">
                  {editable ? (
                    <Input
                      type="number"
                      className="ml-auto w-24 text-right"
                      value={countedFor(line)}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      aria-label={`Counted quantity for ${productName(line.productId)}`}
                    />
                  ) : (
                    <span className="tabular-nums">{line.countedQty ?? '—'}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{line.varianceQty}</td>
                <td className="px-4 py-2 text-right">
                  <Amount value={line.varianceValue} plain />
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No lines yet — freeze this stock take to snapshot the count sheet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void saveCounts()}>
            Save counts
          </Button>
        </div>
      )}
    </div>
  );
}
