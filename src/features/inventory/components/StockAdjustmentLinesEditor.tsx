import { Plus, Trash2 } from 'lucide-react';
import type { NewStockAdjustmentLine, Product, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, ProductCombobox } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';

export interface StockAdjustmentLinesEditorProps {
  lines: NewStockAdjustmentLine[];
  onChange: (lines: NewStockAdjustmentLine[]) => void;
  products: Product[];
  warehouses: Warehouse[];
  disabled?: boolean;
}

const GRID_COLS = 'sm:grid-cols-[2fr_140px_90px_100px_110px_120px_36px]';

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function costEffect(line: NewStockAdjustmentLine): number {
  return roundToCents(line.quantityDelta * line.unitCost);
}

/**
 * Line editor for a draft stock adjustment — mirrors the shape of
 * `purchases/LineItemsEditor.tsx` (product/warehouse picker + numeric
 * inputs, "onChange with the whole array" contract) but for
 * `NewStockAdjustmentLine`, whose signed `quantityDelta` (negative =
 * stock leaves, positive = stock added) and `unitCost` (the
 * approver-entered cost that actually posts — see
 * `stockAdjustmentService.buildLines()`) have no equivalent on a sales/
 * purchase line. `costEffect` is always derived here, never typed
 * directly, so it can never drift from `quantityDelta × unitCost`.
 */
export function StockAdjustmentLinesEditor({
  lines,
  onChange,
  products,
  warehouses,
  disabled = false,
}: StockAdjustmentLinesEditorProps) {
  const trackedProducts = products.filter((p) => p.trackInventory);

  function updateLine(index: number, patch: Partial<NewStockAdjustmentLine>) {
    const merged = { ...lines[index], ...patch };
    const next = [...lines];
    next[index] = { ...merged, costEffect: costEffect(merged) };
    onChange(next);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(index, { productId, unitCost: product?.costPrice ?? lines[index].unitCost });
  }

  function addLine() {
    const defaultWarehouse = warehouses.find((w) => w.isDefault) ?? warehouses[0];
    onChange([
      ...lines,
      {
        productId: '',
        warehouseId: defaultWarehouse?.id ?? '',
        quantityDelta: -1,
        unitCost: 0,
        costEffect: 0,
        notes: '',
      },
    ]);
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
        <span className="text-right">Direction</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit cost</span>
        <span className="text-right">Cost effect</span>
        <span />
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const isIncrease = line.quantityDelta >= 0;
          const quantity = Math.abs(line.quantityDelta);
          return (
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
              <EnumSelect
                value={line.warehouseId}
                disabled={disabled}
                onValueChange={(v) => updateLine(index, { warehouseId: v })}
                aria-label="Warehouse"
                placeholder="Select…"
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              />
              <EnumSelect
                value={isIncrease ? 'increase' : 'decrease'}
                disabled={disabled}
                onValueChange={(v) => updateLine(index, { quantityDelta: (v === 'increase' ? 1 : -1) * quantity })}
                aria-label="Direction"
                options={[
                  { value: 'decrease', label: 'Decrease' },
                  { value: 'increase', label: 'Increase' },
                ]}
              />
              <Input
                type="number"
                min="0"
                step="1"
                className="text-right"
                value={quantity || ''}
                disabled={disabled}
                onChange={(e) => updateLine(index, { quantityDelta: (isIncrease ? 1 : -1) * (parseFloat(e.target.value) || 0) })}
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
                <Amount value={costEffect(line)} plain />
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
          );
        })}
        {lines.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No lines — click &ldquo;Add line&rdquo; to start.
          </div>
        )}
      </div>
    </div>
  );
}
