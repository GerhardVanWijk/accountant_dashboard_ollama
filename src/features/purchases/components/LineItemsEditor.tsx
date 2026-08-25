import { Plus, Trash2 } from 'lucide-react';
import type { AssetCategory, DepreciationMethod, DocumentLineItem, FixedAssetLineDetails, Product, TaxRate, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Amount } from '@/components/app/figure';
import { CATEGORY_LABELS, DEPRECIATION_METHOD_LABELS, WEAR_TEAR_RATE_DEFAULTS } from '@/features/assets/constants';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
  /**
   * Bill-only: lets a line be flagged "capitalize this as a fixed asset"
   * instead of expensed/inventoried (DocumentLineItem.fixedAssetDetails,
   * consumed by billService.postBill() ->
   * FixedAssetService.capitalizeFromBillLine() — see
   * docs/KNOWN_ISSUES.md "No Bill-line capitalization path into the Fixed
   * Asset Register"). Defaults to false so PurchaseOrderForm (which also
   * uses this shared editor) renders unchanged — capitalizing on a PO
   * makes no accounting sense, nothing has been invoiced yet.
   */
  allowFixedAssetCapitalization?: boolean;
}

const DEFAULT_FIXED_ASSET_DETAILS: FixedAssetLineDetails = {
  category: 'other',
  usefulLifeYears: 5,
  depreciationMethod: 'straight_line',
  residualValue: 0,
  taxWearTearRatePercent: WEAR_TEAR_RATE_DEFAULTS.other,
};

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
 * forms — v0-styled re-skin (M14) of the same component, mirroring
 * `src/features/sales/components/SalesLineItemsEditor.tsx`'s card-grid
 * layout/shadcn Input/Button/Amount language. Kept as its own file rather
 * than merged with the Sales editor: this side pre-fills from `costPrice`
 * (not `unitPrice`) and carries the Bill-only fixed-asset capitalization
 * sub-panel that Sales has no equivalent of — see
 * `allowFixedAssetCapitalization` below. `computeLine()` stays a local,
 * independent copy of the Sales editor's identical calculation rather than
 * a shared import, matching the pre-M14 structure — no behavior changed.
 * Tax rates are the real, currently-effective `TaxRate` records
 * (src/features/tax/services/taxRateService.ts, via useTaxRates()) —
 * passed in as a prop, never imported locally. Same for `products` (via
 * useProducts()).
 */
export function LineItemsEditor({
  lineItems,
  onChange,
  taxRates,
  products = [],
  warehouses = [],
  disabled = false,
  allowFixedAssetCapitalization = false,
}: LineItemsEditorProps) {
  const showWarehouseColumn = warehouses.length > 1;
  const showAssetColumn = allowFixedAssetCapitalization;
  /**
   * Four fully-literal grid-cols-[...] strings, one per
   * showAssetColumn/showWarehouseColumn combination — NEVER a
   * runtime-interpolated arbitrary value (docs/DO_NOT_BREAK.md: Tailwind's
   * JIT compiler only generates CSS for class names it can see as literal
   * text in the source, so a template-literal-built class silently
   * produces no styles at all).
   */
  const gridColsClass =
    showAssetColumn && showWarehouseColumn
      ? 'sm:grid-cols-[1fr_70px_140px_2fr_80px_100px_140px_100px_100px_36px]'
      : showAssetColumn
        ? 'sm:grid-cols-[1fr_70px_2fr_80px_100px_140px_100px_100px_36px]'
        : showWarehouseColumn
          ? 'sm:grid-cols-[1fr_140px_2fr_80px_100px_140px_100px_100px_36px]'
          : 'sm:grid-cols-[1fr_2fr_80px_100px_140px_100px_100px_36px]';
  const headerGridColsClass =
    showAssetColumn && showWarehouseColumn
      ? 'grid-cols-[1fr_70px_140px_2fr_80px_100px_140px_100px_100px_36px]'
      : showAssetColumn
        ? 'grid-cols-[1fr_70px_2fr_80px_100px_140px_100px_100px_36px]'
        : showWarehouseColumn
          ? 'grid-cols-[1fr_140px_2fr_80px_100px_140px_100px_100px_36px]'
          : 'grid-cols-[1fr_2fr_80px_100px_140px_100px_100px_36px]';

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

  /** Toggling the asset checkbox on clears productId (mutually exclusive); off clears fixedAssetDetails. */
  function toggleFixedAsset(index: number, checked: boolean) {
    if (checked) {
      updateLine(index, { productId: undefined, fixedAssetDetails: { ...DEFAULT_FIXED_ASSET_DETAILS } });
    } else {
      updateLine(index, { fixedAssetDetails: undefined });
    }
  }

  function updateFixedAssetDetails(index: number, patch: Partial<FixedAssetLineDetails>) {
    const current = lineItems[index].fixedAssetDetails ?? DEFAULT_FIXED_ASSET_DETAILS;
    updateLine(index, { fixedAssetDetails: { ...current, ...patch } });
  }

  /** Prefills the wear-and-tear rate default the first time a category is picked — never overwrites a value already there. */
  function selectAssetCategory(index: number, category: AssetCategory) {
    updateFixedAssetDetails(index, { category, taxWearTearRatePercent: WEAR_TEAR_RATE_DEFAULTS[category] });
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

      <div className={`hidden gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid ${headerGridColsClass}`}>
        <span>Product</span>
        {showAssetColumn && <span>Asset</span>}
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
          <div key={item.id} className="flex flex-col gap-0 rounded-lg border border-border sm:border-0">
            <div className={`grid grid-cols-2 gap-3 p-3 sm:items-center sm:p-0 ${gridColsClass}`}>
              <select
                className={`col-span-2 sm:col-span-1 ${selectClassName}`}
                value={item.productId ?? ''}
                disabled={disabled || Boolean(item.fixedAssetDetails)}
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
              {showAssetColumn && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(item.fixedAssetDetails)}
                    disabled={disabled || Boolean(item.productId)}
                    onChange={(e) => toggleFixedAsset(index, e.target.checked)}
                    aria-label="Capitalize as fixed asset"
                    className="accent-primary"
                  />
                  Asset
                </label>
              )}
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
            {item.fixedAssetDetails && (
              <div className="grid grid-cols-1 gap-3 border-t border-dashed border-border bg-muted/20 p-3 sm:grid-cols-3 md:grid-cols-5">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Category
                  <select
                    className={selectClassName}
                    value={item.fixedAssetDetails.category}
                    disabled={disabled}
                    onChange={(e) => selectAssetCategory(index, e.target.value as AssetCategory)}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Useful Life (Years)
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={item.fixedAssetDetails.usefulLifeYears || ''}
                    disabled={disabled}
                    onChange={(e) => updateFixedAssetDetails(index, { usefulLifeYears: parseFloat(e.target.value) || 0 })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Depreciation Method
                  <select
                    className={selectClassName}
                    value={item.fixedAssetDetails.depreciationMethod}
                    disabled={disabled}
                    onChange={(e) =>
                      updateFixedAssetDetails(index, { depreciationMethod: e.target.value as DepreciationMethod })
                    }
                  >
                    {Object.entries(DEPRECIATION_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Residual Value
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.fixedAssetDetails.residualValue || ''}
                    disabled={disabled}
                    onChange={(e) => updateFixedAssetDetails(index, { residualValue: parseFloat(e.target.value) || 0 })}
                  />
                </label>
                {item.fixedAssetDetails.depreciationMethod === 'reducing_balance' && (
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Reducing Balance Rate (%)
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.fixedAssetDetails.reducingBalanceRatePercent ?? ''}
                      disabled={disabled}
                      onChange={(e) =>
                        updateFixedAssetDetails(index, { reducingBalanceRatePercent: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  SARS Wear-and-Tear Rate (%)
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.fixedAssetDetails.taxWearTearRatePercent ?? ''}
                    disabled={disabled}
                    onChange={(e) =>
                      updateFixedAssetDetails(index, { taxWearTearRatePercent: parseFloat(e.target.value) || 0 })
                    }
                  />
                </label>
              </div>
            )}
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
