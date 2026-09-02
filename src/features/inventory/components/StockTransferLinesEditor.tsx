import { Plus, Trash2 } from 'lucide-react';
import type { NewStockTransferLine, Product } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { ProductCombobox } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';

export interface StockTransferLinesEditorProps {
  lines: NewStockTransferLine[];
  onChange: (lines: NewStockTransferLine[]) => void;
  products: Product[];
  disabled?: boolean;
}

const GRID_COLS = 'sm:grid-cols-[2fr_100px_120px_120px_36px]';

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function totalCost(line: NewStockTransferLine): number {
  return roundToCents(line.quantity * line.unitCost);
}

/**
 * Line editor for a draft stock transfer — one warehouse pair per document
 * (the header's `fromWarehouseId`/`toWarehouseId`), so a line only needs a
 * product/quantity/cost, unlike `StockAdjustmentLinesEditor`. `unitCost` is
 * only what the line was priced at when added; the actual dispatch/receive
 * posting values at the product's live WAC instead
 * (`stockTransferService.buildTransferLegLines()`), so this is display
 * context, not the number that will post.
 */
export function StockTransferLinesEditor({ lines, onChange, products, disabled = false }: StockTransferLinesEditorProps) {
  const trackedProducts = products.filter((p) => p.trackInventory);

  function updateLine(index: number, patch: Partial<NewStockTransferLine>) {
    const merged = { ...lines[index], ...patch };
    const next = [...lines];
    next[index] = { ...merged, totalCost: totalCost(merged) };
    onChange(next);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(index, { productId, unitCost: product?.costPrice ?? lines[index].unitCost });
  }

  function addLine() {
    onChange([...lines, { productId: '', quantity: 1, unitCost: 0, totalCost: 0 }]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Lines</span>
        <Button variant="outline" size="sm" type="button" onClick={addLine} disabled={disabled}>
          <Plus data-icon="inline-start" />
          Add line
        </Button>
      </div>

      <div className={`hidden gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid ${GRID_COLS}`}>
        <span>Product</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit cost</span>
        <span className="text-right">Total cost</span>
        <span />
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <div key={index} className={`grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-none sm:gap-3 sm:border-0 sm:p-0 ${GRID_COLS}`}>
            <div className="col-span-2 sm:col-span-1">
              <ProductCombobox
                products={trackedProducts}
                value={line.productId || null}
                onChange={(productId) => selectProduct(index, productId ?? '')}
                customLineLabel={null}
                disabled={disabled}
                aria-label="Product"
              />
            </div>
            <Input
              type="number"
              min="0"
              step="1"
              className="text-right"
              value={line.quantity || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { quantity: parseFloat(e.target.value) || 0 })}
              aria-label="Quantity"
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              className="text-right"
              value={line.unitCost || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { unitCost: parseFloat(e.target.value) || 0 })}
              aria-label="Unit cost"
            />
            <span className="figure self-center text-right text-sm font-medium tabular-nums">
              <Amount value={totalCost(line)} plain />
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              className="justify-self-end text-muted-foreground hover:text-destructive"
              onClick={() => removeLine(index)}
              disabled={disabled}
              aria-label="Remove line"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {lines.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No lines — click &ldquo;Add line&rdquo; to start.
          </div>
        )}
      </div>
    </div>
  );
}
