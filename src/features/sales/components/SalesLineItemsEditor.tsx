import { Plus, Trash2 } from 'lucide-react';
import type { DocumentLineItem, Product, TaxRate, Warehouse } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect, ProductCombobox } from '@/components/app/combobox';
import { Amount } from '@/components/app/figure';
import { computeLine } from '../utils/lineItemCalculations';

export interface SalesLineItemsEditorProps {
  lineItems: DocumentLineItem[];
  onChange: (lineItems: DocumentLineItem[]) => void;
  /** Currently-effective tax rates (via useTaxRates()) — never hardcoded, per docs/DO_NOT_BREAK.md. */
  taxRates: TaxRate[];
  /** Real Products (via useProducts()) a line can be tied to. */
  products?: Product[];
  /** Real Warehouses (via useWarehouses()) a tracked-inventory line can be attributed to. */
  warehouses?: Warehouse[];
  /**
   * Show read-only stock availability under each tracked-product line (on
   * hand vs. what this document already commits) and warn when a line asks
   * for more than is available. Opt-in — only the Sales Order form turns
   * this on. It never reserves stock, posts, or blocks submit (docs brief
   * Part R): a Sales Order stays a non-posting commitment document.
   */
  showStockAvailability?: boolean;
  /**
   * Derived stock commitment (Phase 5A): units of a product already committed
   * to OTHER confirmed sales orders, for `(productId, warehouseId)` — the
   * line's warehouse when set, otherwise summed across warehouses. Passed down
   * by `SalesOrderForm` from `useStockCommitments()`. When omitted, the stock
   * caption falls back to on-hand only. This never reserves stock, posts, or
   * blocks submit.
   */
  externalCommittedFor?: (productId: string, warehouseId?: string) => number;
  /**
   * Per-warehouse on-hand quantity for `(productId, warehouseId)` from
   * `stock_balances` — used ONLY when a line carries an explicit `warehouseId`
   * (multi-warehouse tenants), so the "On hand" figure is at the SAME
   * warehouse scope as `externalCommittedFor`. Returns `undefined` when there
   * is no balance row; the caption then falls back to the company-wide
   * `product.quantityOnHand`. Fixes the Phase 5A caption mixing company-wide
   * on-hand with warehouse-scoped committed (docs/KNOWN_ISSUES.md).
   */
  onHandFor?: (productId: string, warehouseId?: string) => number | undefined;
  disabled?: boolean;
}

/**
 * v0-styled line-item editor shared by every Sales document form (Invoice,
 * Credit Note, Quote and Sales Order). Same `computeLine()` calculation
 * throughout (shared via utils/lineItemCalculations.ts), same
 * product-select / warehouse-select / tax-rate behavior.
 *
 * The product field is the shared `ProductCombobox` (docs brief Parts B/C)
 * — searchable by SKU / name / barcode, themed for dark mode, dropdown
 * anchored downward — and given real width in the row grid so product
 * identity is legible. Purchases' own `LineItemsEditor.tsx` is a separate
 * component (PO/Bill forms have fixed-asset capitalization) — not this file
 * re-used.
 */
export function SalesLineItemsEditor({
  lineItems,
  onChange,
  taxRates,
  products = [],
  warehouses = [],
  showStockAvailability = false,
  externalCommittedFor,
  onHandFor,
  disabled = false,
}: SalesLineItemsEditorProps) {
  const showWarehouseColumn = warehouses.length > 1;

  /**
   * Units of a product already spoken for by *other* lines on this same
   * document — so "available" nets out double-ordering the same SKU across
   * two lines without any stock-reservation model.
   */
  function committedElsewhere(productId: string, exceptIndex: number): number {
    return lineItems.reduce(
      (sum, li, i) => (i !== exceptIndex && li.productId === productId ? sum + (li.quantity || 0) : sum),
      0,
    );
  }

  function availabilityFor(index: number) {
    if (!showStockAvailability) return null;
    const line = lineItems[index];
    if (!line?.productId) return null;
    const product = products.find((p) => p.id === line.productId);
    if (!product || !product.trackInventory) return null;
    // Keep on-hand and committed at the SAME warehouse scope: when the line
    // targets a specific warehouse use that warehouse's on-hand + committed,
    // otherwise the company-wide on-hand + committed summed across warehouses.
    const scopedWarehouseId = line.warehouseId;
    const onHand =
      (scopedWarehouseId ? onHandFor?.(product.id, scopedWarehouseId) : undefined) ?? product.quantityOnHand;
    // Derived commitment to OTHER confirmed sales orders (Phase 5A).
    const externalCommitted = externalCommittedFor?.(product.id, scopedWarehouseId) ?? 0;
    // Units this same document already spoke for on its other lines.
    const onOtherLinesHere = committedElsewhere(product.id, index);
    const committed = externalCommitted + onOtherLinesHere;
    const available = onHand - committed;
    const ordered = line.quantity || 0;
    const short = ordered > available;
    return { onHand, committed, externalCommitted, onOtherLinesHere, available, short, ordered };
  }

  const gridCols = showWarehouseColumn
    ? 'sm:grid-cols-[minmax(220px,1.2fr)_150px_minmax(180px,1fr)_84px_120px_150px_92px_120px_36px]'
    : 'sm:grid-cols-[minmax(240px,1.3fr)_minmax(200px,1fr)_84px_120px_150px_92px_120px_36px]';

  function updateLine(index: number, patch: Partial<DocumentLineItem>) {
    const merged = { ...lineItems[index], ...patch };
    const { lineTotal, taxAmount } = computeLine(merged.quantity, merged.unitPrice, merged.taxRateId, taxRates);
    const next = [...lineItems];
    next[index] = { ...merged, lineTotal, taxAmount };
    onChange(next);
  }

  /** Selecting a product overwrites description/unit price/tax rate from the real Product record — a deliberate replace, not a merge. */
  function selectProduct(index: number, productId: string | null) {
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
        className={`hidden gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid ${gridCols}`}
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
        {lineItems.map((item, index) => {
          const availability = availabilityFor(index);
          return (
          <div key={item.id} className="flex flex-col gap-1">
          <div
            className={`grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:items-start sm:border-0 sm:p-0 ${gridCols}`}
          >
            <div className="col-span-2 sm:col-span-1">
              <ProductCombobox
                products={products}
                value={item.productId ?? null}
                onChange={(productId) => selectProduct(index, productId)}
                disabled={disabled}
                aria-label="Product"
              />
            </div>
            {showWarehouseColumn && (
              <EnumSelect
                value={item.warehouseId ?? ''}
                disabled={disabled || !item.productId}
                onValueChange={(v) => updateLine(index, { warehouseId: v || undefined })}
                aria-label="Warehouse"
                options={[
                  { value: '', label: 'Default warehouse' },
                  ...warehouses.map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
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
            <EnumSelect
              value={item.taxRateId ?? ''}
              disabled={disabled}
              onValueChange={(v) => updateLine(index, { taxRateId: v || undefined })}
              aria-label="Tax rate"
              options={[
                { value: '', label: 'No tax' },
                ...taxRates.map((rate) => ({ value: rate.id, label: rate.name })),
              ]}
            />
            <span className="figure text-right text-sm tabular-nums text-muted-foreground sm:pt-2">
              <Amount value={item.taxAmount} plain />
            </span>
            <span className="figure text-right text-sm font-medium tabular-nums sm:pt-2">
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
          {availability && (
            <p
              className={`px-1 text-xs tabular-nums sm:px-0 ${availability.short ? 'text-status-warning' : 'text-muted-foreground'}`}
            >
              On hand {availability.onHand.toLocaleString('en-ZA')} · Committed{' '}
              {availability.committed.toLocaleString('en-ZA')} · Available{' '}
              {availability.available.toLocaleString('en-ZA')}
              {availability.short && (
                <>
                  {' '}
                  — this line orders {availability.ordered.toLocaleString('en-ZA')}, more than the{' '}
                  {availability.available.toLocaleString('en-ZA')} available (
                  {availability.externalCommitted.toLocaleString('en-ZA')} committed to other confirmed orders
                  {availability.onOtherLinesHere > 0
                    ? `, ${availability.onOtherLinesHere.toLocaleString('en-ZA')} to other lines on this order`
                    : ''}
                  ).
                </>
              )}
            </p>
          )}
          </div>
          );
        })}
        {lineItems.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No line items — click &ldquo;Add line&rdquo; to start.
          </div>
        )}
      </div>
    </div>
  );
}
