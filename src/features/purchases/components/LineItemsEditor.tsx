import type { DocumentLineItem, Product, TaxRate, Warehouse } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';

const inputClass =
  'w-full rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface LineItemsEditorProps {
  lineItems: DocumentLineItem[];
  onChange: (lineItems: DocumentLineItem[]) => void;
  /** Currently-effective tax rates (via useTaxRates()) — never hardcoded, per docs/DO_NOT_BREAK.md. */
  taxRates: TaxRate[];
  /**
   * Real Products (via useProducts()) a line can be tied to — this is the
   * ONLY place in the Purchases module a document line item's `productId`
   * gets set. Without it, `InventoryPostingAdapter`'s Inventory
   * capitalization / stock-receipt logic
   * (src/features/inventory/services/inventoryPostingAdapter.ts) can never
   * fire from real user input, only from seed data or direct service
   * calls — see docs/KNOWN_ISSUES.md. Optional so this component still
   * renders for a caller mid-migration; pass `[]` explicitly rather than
   * omitting it once a product picker is wanted.
   */
  products?: Product[];
  /**
   * Real Warehouses (via useWarehouses()) a tracked-inventory line can be
   * attributed to — only rendered as a column when there's more than one
   * to choose from, since a single-warehouse business has nothing to
   * pick. Leaving a line's warehouse unset falls back to
   * `Warehouse.isDefault` in `InventoryPostingAdapter`, so this is purely
   * additive — every existing document keeps working unchanged.
   */
  warehouses?: Warehouse[];
  disabled?: boolean;
}

function computeLine(
  quantity: number,
  unitPrice: number,
  taxRateId: string | undefined,
  taxRates: TaxRate[],
): { lineTotal: number; taxAmount: number } {
  const lineTotal = quantity * unitPrice;
  const rate = taxRates.find((r) => r.id === taxRateId);
  const taxAmount = rate ? lineTotal * (rate.rate / 100) : 0;
  return { lineTotal, taxAmount };
}

/**
 * Reusable line-item editor shared by the Purchase Order and Bill create
 * forms — quantity/unit price/tax rate drive an auto-calculated tax amount
 * and line total, both rendered via FinancialNumber per
 * docs/FINANCIAL_UI_GUIDE.md. Tax rates are the real, currently-effective
 * `TaxRate` records (src/features/tax/services/taxRateService.ts, via
 * useTaxRates()) — passed in as a prop, never imported locally. Same for
 * `products` (via useProducts()).
 */
export function LineItemsEditor({
  lineItems,
  onChange,
  taxRates,
  products = [],
  warehouses = [],
  disabled = false,
}: LineItemsEditorProps) {
  const showWarehouseColumn = warehouses.length > 1;
  const gridColsClass = showWarehouseColumn
    ? 'grid-cols-[160px_140px_2fr_80px_100px_140px_100px_100px_36px]'
    : 'grid-cols-[160px_2fr_80px_100px_140px_100px_100px_36px]';
  const minWidthClass = showWarehouseColumn ? 'min-w-[940px]' : 'min-w-[800px]';

  function updateLine(index: number, patch: Partial<DocumentLineItem>) {
    const merged = { ...lineItems[index], ...patch };
    const { lineTotal, taxAmount } = computeLine(merged.quantity, merged.unitPrice, merged.taxRateId, taxRates);
    const next = [...lineItems];
    next[index] = { ...merged, lineTotal, taxAmount };
    onChange(next);
  }

  /**
   * Selecting a product pre-fills description/unit price/tax rate from the
   * real Product record — deliberately using `costPrice` (what we pay a
   * supplier), not `unitPrice` (what we charge a customer, the Sales-side
   * editor's field). A deliberate overwrite, not a merge — picking a
   * different product replaces what was there. "Custom line" (empty
   * value) clears productId but leaves manually-typed fields alone.
   */
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
      unitPrice: product.costPrice,
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
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Line Items</span>
        <Button variant="ghost" type="button" onClick={addLine} disabled={disabled}>
          <Icon name="add" size={14} />
          Add Line
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <div className={`grid ${minWidthClass} ${gridColsClass} gap-2 bg-primary/10 px-sm py-xs text-xs font-semibold tabular-nums`}>
          <div>Product</div>
          {showWarehouseColumn && <div>Warehouse</div>}
          <div>Description</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Unit Price</div>
          <div>Tax Rate</div>
          <div className="text-right">Tax</div>
          <div className="text-right">Line Total</div>
          <div />
        </div>
        {lineItems.map((item, index) => (
          <div
            key={item.id}
            className={`grid ${minWidthClass} ${gridColsClass} items-center gap-2 border-t border-border/50 px-sm py-xs tabular-nums`}
          >
            <select
              className={inputClass}
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
                className={inputClass}
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
            <input
              className={inputClass}
              value={item.description}
              placeholder="Description"
              disabled={disabled}
              onChange={(e) => updateLine(index, { description: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="1"
              className={`${inputClass} text-right`}
              value={item.quantity || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { quantity: parseFloat(e.target.value) || 0 })}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className={`${inputClass} text-right`}
              value={item.unitPrice || ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { unitPrice: parseFloat(e.target.value) || 0 })}
            />
            <select
              className={inputClass}
              value={item.taxRateId ?? ''}
              disabled={disabled}
              onChange={(e) => updateLine(index, { taxRateId: e.target.value || undefined })}
            >
              <option value="">No Tax</option>
              {taxRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name}
                </option>
              ))}
            </select>
            <div className="text-right text-sm text-text-secondary">
              <FinancialNumber value={item.taxAmount} format={formatCurrency} showFlash={false} />
            </div>
            <div className="text-right text-sm font-semibold">
              <FinancialNumber value={item.lineTotal} format={formatCurrency} showFlash={false} />
            </div>
            <button
              type="button"
              onClick={() => removeLine(index)}
              disabled={disabled}
              aria-label="Remove line"
              className="text-text-muted hover:text-danger disabled:opacity-50"
            >
              <Icon name="delete" size={14} />
            </button>
          </div>
        ))}
        {lineItems.length === 0 && (
          <div className="px-sm py-md text-center text-sm text-text-muted">
            No line items — click &ldquo;Add Line&rdquo; to start.
          </div>
        )}
      </div>
    </div>
  );
}
