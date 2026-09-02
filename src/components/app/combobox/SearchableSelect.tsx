import { useMemo, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/shadcn/combobox';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  /** Stable identity persisted by the form (e.g. a product / customer id). */
  value: string;
  /** Text shown in the closed trigger and matched by the default filter. */
  label: string;
  /** Secondary line under the label in the open list. */
  description?: ReactNode;
  /** Extra text folded into the search match (SKU, code, barcode, …). */
  keywords?: string;
  disabled?: boolean;
  /** Right-aligned metadata in the row (e.g. "On hand: 12"). */
  meta?: ReactNode;
  /** Leading icon/element in the row. */
  icon?: ReactNode;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Text on the search input inside the popup. */
  searchPlaceholder?: string;
  /** Shown in the list when the filter matches nothing. */
  emptyMessage?: string;
  disabled?: boolean;
  /** Show a spinner + "Loading…" row instead of the list. */
  loading?: boolean;
  /** Render a clear (×) button in the trigger when a value is set. */
  clearable?: boolean;
  /** `aria-invalid` on the trigger — wires the form's error ring. */
  invalid?: boolean;
  id?: string;
  name?: string;
  className?: string;
  /** Extra class on the trigger button (width overrides live here). */
  triggerClassName?: string;
  'aria-label'?: string;
}

interface OptionItem extends SearchableSelectOption {
  /** base-ui reads `label` for display; `search` carries the full haystack. */
  search: string;
}

/**
 * `SearchableSelect` (a.k.a. VertexCombobox) — the shared app-wide
 * searchable dropdown (docs brief Part B). One implementation, correct in
 * both themes, replacing the long native `<select>` lists that rendered
 * with the browser's bright-blue highlight and no search.
 *
 * Behaviour that matters for the transaction line-item forms:
 * - the popup prefers DOWN and only shifts to stay on screen — it never
 *   flips up over the fields above it (see `combobox.tsx`);
 * - its height is capped and the list scrolls inside;
 * - full keyboard model (type to filter, ↑/↓ to move, Enter to pick,
 *   Esc to close) comes from base-ui.
 *
 * Specialised wrappers (`ProductCombobox`, `EntityCombobox`) build on this.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found.',
  disabled = false,
  loading = false,
  clearable = false,
  invalid = false,
  id,
  name,
  className,
  triggerClassName,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const items = useMemo<OptionItem[]>(
    () =>
      options.map((o) => ({
        ...o,
        search: `${o.label} ${o.keywords ?? ''}`.toLowerCase(),
      })),
    [options],
  );

  const selected = useMemo(
    () => items.find((o) => o.value === value) ?? null,
    [items, value],
  );

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(next: OptionItem | null) => onChange(next ? next.value : null)}
      disabled={disabled}
      name={name}
      filter={(item, query) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (item as OptionItem).search.includes(q);
      }}
    >
      <div className={cn('relative', className)}>
        <ComboboxTrigger
          id={id}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          data-placeholder={selected ? undefined : ''}
          className={cn(clearable && selected ? 'pr-14' : undefined, triggerClassName)}
        >
          <ComboboxValue>
            {(current: OptionItem | null) =>
              current ? (
                <span className="flex min-w-0 items-center gap-2">
                  {current.icon}
                  <span className="truncate">{current.label}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )
            }
          </ComboboxValue>
        </ComboboxTrigger>
        {clearable && selected && !disabled && (
          <ComboboxClear className="absolute top-1/2 right-8 -translate-y-1/2" />
        )}
      </div>

      <ComboboxContent>
        <ComboboxInput placeholder={searchPlaceholder} />
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : (
          <>
            <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
            <ComboboxList>
              {(item: OptionItem) => (
                <ComboboxItem key={item.value} value={item} disabled={item.disabled}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      {item.icon}
                      <span className="truncate font-medium">{item.label}</span>
                    </span>
                    {item.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  {item.meta ? (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {item.meta}
                    </span>
                  ) : null}
                </ComboboxItem>
              )}
            </ComboboxList>
          </>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
