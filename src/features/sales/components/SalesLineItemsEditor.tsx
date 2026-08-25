import { Plus, Trash2 } from 'lucide-react';
import type { DocumentLineItem, Product, TaxRate, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';
import { computeLine } from '../utils/lineItemCalculations';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export interface SalesLineItemsEditorProps {
  lineItems: DocumentLineItem[];
  onChange: (lineItems: DocumentLineItem[]) => void;
  /** Currently-effective tax rates (via useTaxRates()) — never hardcoded, per docs/DO_NOT_BREAK.md. */
  taxRates: TaxRate[];
  /** Real Products (via useProducts()) a line can be tied to. */
  products?: Product[];
  /** Real Warehouses (via useWarehouses()) a tracked-inventory line can be attributed to. */
  warehouses?: Warehouse[];
  disabled?: boolean;
}

/**
 * v0-styled re-skin of `LineItemsEditor.tsx` for the Invoice/Credit Note
 * forms — same `computeLine()` calculation (now shared via
 * utils/lineItemCalculations.ts), same product-select/warehouse-select/
 * tax-rate behavior, only the JSX and layout differ (v0's card-grid rows
 * instead of the old table). `LineItemsEditor.tsx` itself is untouched and
 * still serves the out-of-M4-scope Quote/SalesOrder forms.
 */
export function SalesLineItemsEditor({
  lineItems,
  onChange,
  taxRates,
  products = [],
  warehouses = [],
  disabled = false,
}: SalesLineItemsEditorProps) {
  const showWarehouseColumn = warehouses.length > 1;

  function updateLine(index: number, patch: Partial<DocumentLineItem>) {
    const merged = { ...lineItems[index], ...patch };
    const { lineTotal, taxAmount } = computeLine(merged.quantity, merged.unitPrice, merged.taxRateId, taxRates);
    const next = [...lineItems];
    next[index] = { ...merged, lineTotal, taxAmount };
    onChange(next);
  }

  /** Selecting a product overwrites description/unit price/tax rate from the real Product record — a deliberate replace, not a merge. */
  function selectProduct(index: number, productId: string) {
    if (!productId) {
      updateLine(index, { productId: undefined });
      return;
    }
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const taxRateId = product.taxRateId && taxRates.some((r) => r.id === product.taxRateId) ? product.taxRateId : undefined;
    updateLine(index, {
      productId: product.id,
      description: product.name,
      unitPrice: product.unitPrice,
      taxRateId,
    });
  }

  function addLine() {
    onChange([
      ...lineItems,
      {
        id: `li_${Date.now()}_${lineItems.length}`,
        description: '',
        quantity: 1,
        unitPrice: 0,
        taxRateId: taxRates[0]?.id,
        taxAmount: 0,
        lineTotal: 0,
      },
    ]);
  }

  function removeLine(index: number) {
    onChange(lineItems.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Line items</span>
        <Button variant="outline" size="sm" type="button" onClick={addLine} disabled={disabled}>
          <Plus data-icon="inline-start" />
          Add line
        </Button>
      </div>

      <div
        className={`hidden gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid ${
          showWarehouseColumn
            ? 'grid-cols-[1fr_140px_2fr_80px_100px_140px_100px_100px_36px]'
            : 'grid-cols-[1fr_2fr_80px_100px_140px_100px_100px_36px]'
        }`}
      >
        <span>Product</span>
        {showWarehouseColumn && <span>Warehouse</span>}
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span>Tax rate</span>
        <span className="text-right">Tax</span>
        <span className="text-right">Line total</span>
        <span />
      </div>

      <div className="flex flex-col gap-3">
        {lineItems.map((item, index) => (
          <div
            key={item.id}
            className={`grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:items-center sm:border-0 sm:p-0 ${
              showWarehouseColumn
                ? 'sm:grid-cols-[1fr_140px_2fr_80px_100px_140px_100px_100px_36px]'
                : 'sm:grid-cols-[1fr_2fr_80px_100px_140px_100px_100px_36px]'
            }`}
          >
            <select
              className={`col-span-2 sm:col-span-1 ${selectClassName}`}
              value={item.productId ?? ''}
              disabled={disabled}
              onChange={(e) => selectProduct(index, e.target.value)}
              aria-label="Product"
            >
              <option value="">Custom line</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
            {showWarehouseColumn && (
              <select
                className={selectClassName}
                value={item.warehouseId ?? ''}
                disabled={disabled || !item.productId}
                onChange={(e) => updateLine(index, { warehouseId: e.target.value || undefined })}
                aria-label="Warehouse"
              >
                <option value="">Default warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <Input
              className="col-span-2 sm:col-span-1"
              value={item.description}
              placeholder="Item or service description"
              disabled={disabled}
              onChange={(e) => updateLine(index, { description: e.target.value })}
              aria-label="Line description"
            />
            <Input
              type="number"
              min="0"
              step="1"
              className="text-right"
              value={item.quantity || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { quantity: parseFloat(e.target.value) || 0 })}
              aria-label="Quantity"
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              className="text-right"
              value={item.unitPrice || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { unitPrice: parseFloat(e.target.value) || 0 })}
              aria-label="Unit price"
            />
            <select
              className={selectClassName}
              value={item.taxRateId ?? ''}
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
            </select>
            <span className="figure text-right text-sm tabular-nums text-muted-foreground">
              <Amount value={item.taxAmount} plain />
            </span>
            <span className="figure text-right text-sm font-medium tabular-nums">
              <Amount value={item.lineTotal} plain />
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
        {lineItems.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No line items — click &ldquo;Add line&rdquo; to start.
          </div>
        )}
      </div>
    </div>
  );
}
