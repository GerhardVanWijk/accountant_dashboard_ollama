import { Plus, Trash2 } from 'lucide-react';
import type { NewOpeningStockLine, Product, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { Amount } from '@/components/app/figure';

export interface OpeningStockLinesEditorProps {
  lines: NewOpeningStockLine[];
  onChange: (lines: NewOpeningStockLine[]) => void;
  products: Product[];
  warehouses: Warehouse[];
  disabled?: boolean;
}

const GRID_COLS = 'sm:grid-cols-[2fr_140px_90px_120px_120px_36px]';

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function totalCost(line: NewOpeningStockLine): number {
  return roundToCents(line.quantity * line.unitCost);
}

/**
 * Line editor for a draft opening-stock batch — establishes the initial
 * WAC for a product at a warehouse, so `unitCost` here is never
 * prefilled from `product.costPrice` (there is no cost yet; that's what
 * this line sets).
 */
export function OpeningStockLinesEditor({ lines, onChange, products, warehouses, disabled = false }: OpeningStockLinesEditorProps) {
  const trackedProducts = products.filter((p) => p.trackInventory);

  function updateLine(index: number, patch: Partial<NewOpeningStockLine>) {
    const merged = { ...lines[index], ...patch };
    const next = [...lines];
    next[index] = { ...merged, totalCost: totalCost(merged) };
    onChange(next);
  }

  function addLine() {
    const defaultWarehouse = warehouses.find((w) => w.isDefault) ?? warehouses[0];
    onChange([...lines, { productId: '', warehouseId: defaultWarehouse?.id ?? '', quantity: 1, unitCost: 0, totalCost: 0 }]);
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
        <span>Warehouse</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit cost</span>
        <span className="text-right">Total cost</span>
        <span />
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <div key={index} className={`grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-none sm:gap-3 sm:border-0 sm:p-0 ${GRID_COLS}`}>
            <NativeSelect
              className="col-span-2 sm:col-span-1"
              value={line.productId}
              disabled={disabled}
              onChange={(e) => updateLine(index, { productId: e.target.value })}
              aria-label="Product"
            >
              <option value="">Select a product…</option>
              {trackedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={line.warehouseId}
              disabled={disabled}
              onChange={(e) => updateLine(index, { warehouseId: e.target.value })}
              aria-label="Warehouse"
            >
              <option value="">Select…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
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
