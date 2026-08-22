import type { AssetCategory, DepreciationMethod, DocumentLineItem, FixedAssetLineDetails, Product, TaxRate, Warehouse } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { CATEGORY_LABELS, DEPRECIATION_METHOD_LABELS, WEAR_TEAR_RATE_DEFAULTS } from '@/features/assets/constants';

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
      ? 'grid-cols-[160px_90px_140px_2fr_80px_100px_140px_100px_100px_36px]'
      : showAssetColumn
        ? 'grid-cols-[160px_90px_2fr_80px_100px_140px_100px_100px_36px]'
        : showWarehouseColumn
          ? 'grid-cols-[160px_140px_2fr_80px_100px_140px_100px_100px_36px]'
          : 'grid-cols-[160px_2fr_80px_100px_140px_100px_100px_36px]';
  const minWidthClass =
    showAssetColumn && showWarehouseColumn
      ? 'min-w-[1030px]'
      : showAssetColumn
        ? 'min-w-[890px]'
        : showWarehouseColumn
          ? 'min-w-[940px]'
          : 'min-w-[800px]';

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
          {showAssetColumn && <div>Asset</div>}
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
          <div key={item.id} className="border-t border-border/50">
          <div
            className={`grid ${minWidthClass} ${gridColsClass} items-center gap-2 px-sm py-xs tabular-nums`}
          >
            <select
              className={inputClass}
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
              <label className="flex items-center justify-center gap-xs text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={Boolean(item.fixedAssetDetails)}
                  disabled={disabled || Boolean(item.productId)}
                  onChange={(e) => toggleFixedAsset(index, e.target.checked)}
                  aria-label="Capitalize as fixed asset"
                />
                Asset
              </label>
            )}
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
          {item.fixedAssetDetails && (
            <div className="grid grid-cols-1 gap-2 border-t border-dashed border-border/50 bg-background px-sm py-xs sm:grid-cols-3 md:grid-cols-5">
              <label className="flex flex-col gap-0.5 text-xs text-text-secondary">
                Category
                <select
                  className={inputClass}
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
              <label className="flex flex-col gap-0.5 text-xs text-text-secondary">
                Useful Life (Years)
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={inputClass}
                  value={item.fixedAssetDetails.usefulLifeYears || ''}
                  disabled={disabled}
                  onChange={(e) => updateFixedAssetDetails(index, { usefulLifeYears: parseFloat(e.target.value) || 0 })}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-text-secondary">
                Depreciation Method
                <select
                  className={inputClass}
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
              <label className="flex flex-col gap-0.5 text-xs text-text-secondary">
                Residual Value
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={item.fixedAssetDetails.residualValue || ''}
                  disabled={disabled}
                  onChange={(e) => updateFixedAssetDetails(index, { residualValue: parseFloat(e.target.value) || 0 })}
                />
              </label>
              {item.fixedAssetDetails.depreciationMethod === 'reducing_balance' && (
                <label className="flex flex-col gap-0.5 text-xs text-text-secondary">
                  Reducing Balance Rate (%)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={item.fixedAssetDetails.reducingBalanceRatePercent ?? ''}
                    disabled={disabled}
                    onChange={(e) =>
                      updateFixedAssetDetails(index, { reducingBalanceRatePercent: parseFloat(e.target.value) || 0 })
                    }
                  />
                </label>
              )}
              <label className="flex flex-col gap-0.5 text-xs text-text-secondary">
                SARS Wear-and-Tear Rate (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
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
          <div className="px-sm py-md text-center text-sm text-text-muted">
            No line items — click &ldquo;Add Line&rdquo; to start.
          </div>
        )}
      </div>
    </div>
  );
}
