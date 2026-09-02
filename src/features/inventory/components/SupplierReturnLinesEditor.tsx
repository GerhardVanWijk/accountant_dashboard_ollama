import { Plus, Trash2 } from 'lucide-react';
import type { NewSupplierReturnLine, Product, TaxRate, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { NativeSelect } from '@/components/ui/shadcn/native-select';
import { ProductCombobox } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';

export interface SupplierReturnLinesEditorProps {
  lines: NewSupplierReturnLine[];
  onChange: (lines: NewSupplierReturnLine[]) => void;
  products: Product[];
  warehouses: Warehouse[];
  taxRates: TaxRate[];
  disabled?: boolean;
}

const GRID_COLS = 'sm:grid-cols-[1.5fr_120px_70px_100px_120px_90px_100px_36px]';

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeLine(quantity: number, unitPrice: number, taxRateId: string | undefined, taxRates: TaxRate[]): { lineTotal: number; taxAmount: number } {
  const lineTotal = roundToCents(quantity * unitPrice);
  const rate = taxRates.find((r) => r.id === taxRateId);
  const taxAmount = rate ? roundToCents(lineTotal * (rate.rate / 100)) : 0;
  return { lineTotal, taxAmount };
}

/**
 * Line editor for a draft supplier return — same "onChange with the whole
 * array" contract and `computeLine()` calculation as
 * `purchases/LineItemsEditor.tsx`, but for `NewSupplierReturnLine`
 * (product/warehouse/description/quantity/unit price/tax rate — no
 * fixed-asset capitalization sub-panel, since a return never capitalizes
 * anything).
 */
export function SupplierReturnLinesEditor({ lines, onChange, products, warehouses, taxRates, disabled = false }: SupplierReturnLinesEditorProps) {
  function updateLine(index: number, patch: Partial<NewSupplierReturnLine>) {
    const merged = { ...lines[index], ...patch };
    const { lineTotal, taxAmount } = computeLine(merged.quantity, merged.unitPrice, merged.taxRateId, taxRates);
    const next = [...lines];
    next[index] = { ...merged, lineTotal, taxAmount };
    onChange(next);
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      updateLine(index, { productId });
      return;
    }
    updateLine(index, { productId: product.id, description: product.name, unitPrice: product.costPrice, taxRateId: product.taxRateId });
  }

  function addLine() {
    const defaultWarehouse = warehouses.find((w) => w.isDefault) ?? warehouses[0];
    onChange([
      ...lines,
      { productId: '', warehouseId: defaultWarehouse?.id, description: '', quantity: 1, unitPrice: 0, taxRateId: taxRates[0]?.id, taxAmount: 0, lineTotal: 0 },
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
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span>Tax rate</span>
        <span className="text-right">Tax</span>
        <span className="text-right">Line total</span>
        <span />
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((line, index) => (
          <div key={index} className={`grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-none sm:gap-3 sm:border-0 sm:p-0 ${GRID_COLS}`}>
            <div className="col-span-2 sm:col-span-1">
              <ProductCombobox
                products={products}
                value={line.productId || null}
                onChange={(productId) => selectProduct(index, productId ?? '')}
                customLineLabel={null}
                disabled={disabled}
                aria-label="Product"
              />
            </div>
            <NativeSelect
              value={line.warehouseId ?? ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { warehouseId: e.target.value || undefined })}
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
              value={line.unitPrice || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { unitPrice: parseFloat(e.target.value) || 0 })}
              aria-label="Unit price"
            />
            <NativeSelect
              value={line.taxRateId ?? ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { taxRateId: e.target.value || undefined })}
              aria-label="Tax rate"
            >
              <option value="">No tax</option>
              {taxRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name}
                </option>
              ))}
            </NativeSelect>
            <span className="figure self-center text-right text-sm tabular-nums text-muted-foreground">
              <Amount value={line.taxAmount} plain />
            </span>
            <span className="figure self-center text-right text-sm font-medium tabular-nums">
              <Amount value={line.lineTotal} plain />
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
