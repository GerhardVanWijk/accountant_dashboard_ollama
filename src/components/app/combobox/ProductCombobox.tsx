import { useMemo, useState } from 'react';
import { Package, PencilLine } from 'lucide-react';

import type { Product, ProductCategory } from '@/types';
import { formatCurrency } from '@/lib/app/format';
import { cn } from '@/lib/utils';
import { useCanAccess } from '@/features/auth/hooks/useCanAccess';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';

/**
 * How the picker is being used. It changes which price is surfaced and
 * whether cost/WAC is ever shown:
 *   - `sales`     → SELL price. Cost / WAC are NEVER shown here (a Sales
 *                   user must not see margin data just because they can
 *                   raise a quote).
 *   - `purchase`  → purchase COST, and only to a user with cost permission.
 *   - `inventory` → weighted-average cost, and only to a user with cost
 *                   permission.
 */
export type ProductComboboxContext = 'sales' | 'purchase' | 'inventory';

export interface ProductComboboxProps {
  products: Product[];
  value: string | null;
  onChange: (productId: string | null) => void;
  /** Defaults to `sales`. */
  context?: ProductComboboxContext;
  /** Company product categories — powers the row subtitle and the in-popover category filter. */
  categories?: ProductCategory[];
  /** The warehouse this document line targets, if any — makes the "on hand" figure warehouse-specific. */
  warehouseId?: string;
  /** Per-`(productId, warehouseId)` on-hand from `stock_balances`. Returns `undefined` when there is no balance row. */
  onHandFor?: (productId: string, warehouseId?: string) => number | undefined;
  /** Label for the "no product — free-text line" choice. `null` hides it. */
  customLineLabel?: string | null;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Only show active products (default true). The current value is always kept. */
  activeOnly?: boolean;
  id?: string;
  triggerClassName?: string;
  'aria-label'?: string;
}

const CUSTOM_LINE_VALUE = '__custom__';
const ALL_CATEGORIES = '';

/** The stock line for a product row — `undefined` for non-tracked / service items (no bogus "0 on hand"). */
function stockLine(
  p: Product,
  warehouseId: string | undefined,
  onHandFor: ProductComboboxProps['onHandFor'],
): { text: string; tone: 'ok' | 'zero' | 'negative' } | undefined {
  if (!p.trackInventory) return undefined;
  const scoped = warehouseId && onHandFor ? onHandFor(p.id, warehouseId) : undefined;
  const qty = scoped ?? p.quantityOnHand ?? 0;
  const scopeSuffix = !warehouseId && onHandFor ? ' · all locations' : '';
  if (qty < 0) return { text: `${qty.toLocaleString('en-ZA')} on hand${scopeSuffix}`, tone: 'negative' };
  if (qty === 0) return { text: 'Out of stock', tone: 'zero' };
  return { text: `${qty.toLocaleString('en-ZA')} on hand${scopeSuffix}`, tone: 'ok' };
}

/** The price line for a product row, by context + cost permission. */
function priceLine(p: Product, context: ProductComboboxContext, canSeeCost: boolean): string | undefined {
  if (context === 'sales') return `${formatCurrency(p.unitPrice)} sell price`;
  if (context === 'purchase') return canSeeCost ? `${formatCurrency(p.costPrice)} cost` : undefined;
  return canSeeCost ? `${formatCurrency(p.costPrice)} WAC` : undefined; // inventory
}

/**
 * The shared product/catalog picker for every sales / purchase / inventory
 * line-item editor. One component, three contexts — never a second picker.
 *
 * A row reads:
 *   HP LaserJet Pro 4103          ← name, the strongest element
 *   HP-4103 · Printers            ← SKU · category
 *   12 on hand · R1 200.00 sell   ← stock + context-appropriate price
 *
 * Search matches name / SKU / barcode. A category filter narrows the list
 * without replacing selection. "Custom line" maps to `null` and is set
 * visually apart from real inventory products.
 *
 * Presentational: the caller supplies `products` / `categories` and owns
 * what selecting one does to the line (description / price / tax).
 */
export function ProductCombobox({
  products,
  value,
  onChange,
  context = 'sales',
  categories = [],
  warehouseId,
  onHandFor,
  customLineLabel = 'Custom line / service',
  placeholder = 'Select a product',
  disabled = false,
  invalid = false,
  activeOnly = true,
  id,
  triggerClassName,
  'aria-label': ariaLabel = 'Product',
}: ProductComboboxProps) {
  const canSeeCost = useCanAccess('inventory', 'cost_edit');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);

  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.name]));
    return (categoryId: string | undefined) => (categoryId ? byId.get(categoryId) : undefined);
  }, [categories]);

  const options = useMemo<SearchableSelectOption[]>(() => {
    const rows: SearchableSelectOption[] = [];
    for (const p of products) {
      if (activeOnly && p.status !== 'active' && p.id !== value) continue;
      if (categoryFilter && p.categoryId !== categoryFilter && p.id !== value) continue;

      const stock = stockLine(p, warehouseId, onHandFor);
      const price = priceLine(p, context, canSeeCost);
      const cat = categoryName(p.categoryId);

      rows.push({
        value: p.id,
        label: p.name,
        description: [p.sku, cat].filter(Boolean).join(' · ') || undefined,
        keywords: [p.sku, p.name, p.barcode].filter(Boolean).join(' '),
        icon: <Package className="size-3.5 text-muted-foreground" />,
        meta:
          stock || price ? (
            <>
              {stock && (
                <span className={cn(stock.tone === 'negative' && 'text-status-warning', stock.tone === 'zero' && 'text-muted-foreground')}>
                  {stock.text}
                </span>
              )}
              {price && <span>{price}</span>}
            </>
          ) : undefined,
      });
    }

    if (customLineLabel) {
      rows.push({
        value: CUSTOM_LINE_VALUE,
        label: customLineLabel,
        description: 'Create a line without an inventory product',
        icon: <PencilLine className="size-3.5 text-muted-foreground" />,
        dividerBefore: rows.length > 0,
      });
    }
    return rows;
  }, [products, categoryName, categoryFilter, activeOnly, value, warehouseId, onHandFor, context, canSeeCost, customLineLabel]);

  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <SearchableSelect
      options={options}
      value={value ?? (customLineLabel ? CUSTOM_LINE_VALUE : null)}
      onChange={(next) => onChange(next && next !== CUSTOM_LINE_VALUE ? next : null)}
      placeholder={placeholder}
      searchPlaceholder="Search products by name, SKU or barcode…"
      emptyMessage="No products match."
      disabled={disabled}
      invalid={invalid}
      id={id}
      triggerClassName={triggerClassName}
      contentClassName="min-w-[min(24rem,calc(100vw-2rem))]"
      headerSlot={
        activeCategories.length > 0 ? (
          <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Filter by category">
            {[{ id: ALL_CATEGORIES, name: 'All' }, ...activeCategories].map((c) => (
              <button
                key={c.id || 'all'}
                type="button"
                onClick={() => setCategoryFilter(c.id)}
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-xs transition-colors',
                  categoryFilter === c.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : undefined
      }
      aria-label={ariaLabel}
    />
  );
}
