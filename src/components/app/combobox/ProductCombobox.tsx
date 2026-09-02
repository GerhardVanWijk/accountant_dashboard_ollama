import { useMemo } from 'react';
import { Package } from 'lucide-react';

import type { Product } from '@/types';
import { formatCurrency } from '@/lib/app/format';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';

export interface ProductComboboxProps {
  products: Product[];
  value: string | null;
  onChange: (productId: string | null) => void;
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

function stockMeta(p: Product): string | undefined {
  if (!p.trackInventory) return p.type === 'service' ? 'Service' : undefined;
  const wac = p.costPrice ? ` · WAC ${formatCurrency(p.costPrice)}` : '';
  return `On hand: ${p.quantityOnHand.toLocaleString('en-ZA')}${wac}`;
}

/**
 * Product picker built on `SearchableSelect` (docs brief Part C). Replaces
 * the cramped native `<select>` of `PRN-008 — long name` options in every
 * sales / purchase line-item editor.
 *
 * - searches SKU, name, description and barcode;
 * - rows show SKU, name and live stock (`On hand: 165 · WAC R784.20`);
 * - a "Custom line" choice maps to `null` so a form can still enter a
 *   free-text / service line with no product link.
 *
 * Presentational only — the caller supplies `products` (from `useProducts()`)
 * and owns what selecting one does to the line (description / price / tax).
 */
export function ProductCombobox({
  products,
  value,
  onChange,
  customLineLabel = 'Custom line (no product)',
  placeholder = 'Select a product',
  disabled = false,
  invalid = false,
  activeOnly = true,
  id,
  triggerClassName,
  'aria-label': ariaLabel = 'Product',
}: ProductComboboxProps) {
  const options = useMemo<SearchableSelectOption[]>(() => {
    const rows: SearchableSelectOption[] = [];
    if (customLineLabel) {
      rows.push({ value: CUSTOM_LINE_VALUE, label: customLineLabel });
    }
    for (const p of products) {
      if (activeOnly && p.status !== 'active' && p.id !== value) continue;
      rows.push({
        value: p.id,
        label: `${p.sku} · ${p.name}`,
        description: p.description ?? p.salesDescription ?? undefined,
        keywords: [p.sku, p.name, p.description, p.barcode, p.category]
          .filter(Boolean)
          .join(' '),
        meta: stockMeta(p),
        icon: <Package className="size-3.5 text-muted-foreground" />,
      });
    }
    return rows;
  }, [products, customLineLabel, activeOnly, value]);

  return (
    <SearchableSelect
      options={options}
      value={value ?? (customLineLabel ? CUSTOM_LINE_VALUE : null)}
      onChange={(next) => onChange(next && next !== CUSTOM_LINE_VALUE ? next : null)}
      placeholder={placeholder}
      searchPlaceholder="Search SKU, name, barcode…"
      emptyMessage="No products match."
      disabled={disabled}
      invalid={invalid}
      id={id}
      triggerClassName={triggerClassName}
      aria-label={ariaLabel}
    />
  );
}
