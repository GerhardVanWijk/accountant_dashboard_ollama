import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/shadcn/tooltip';
import { resolveTabHint, resolveTabIcon } from '@/components/app/semantic-icons';
import { cn } from '@/lib/utils';

export interface RecordTab {
  /** Stable slug — used for the URL `?tab=` value and as the React key. */
  value: string;
  label: string;
  /** Optional explicit icon; when omitted an icon is derived from the slug/label. */
  icon?: ComponentType<{ className?: string }>;
  /** Small trailing count, e.g. number of payments / related records. Hidden when 0/undefined. */
  count?: number;
  /** Extra line for the tab's tooltip, e.g. "12 movements / evidence records". */
  hint?: string;
  content: ReactNode;
}

export interface RecordTabsProps {
  tabs: RecordTab[];
  /**
   * When set (and not `embedded`), the active tab is mirrored to
   * `?<urlParam>=<value>` so a tab is linkable / survives refresh and the
   * browser back button. Omit for embedded/overlay use.
   */
  urlParam?: string;
  /** Hides URL syncing — the record is shown inside an overlay, not at its own route. */
  embedded?: boolean;
  /** Accessible name for the tab list. */
  ariaLabel?: string;
  /**
   * How much of each tab label is painted:
   *  - `responsive` (default) — icon-led: icon only on tablet/narrow, icon +
   *    label from `lg` up. The full label is always in the accessibility tree
   *    and in the tooltip.
   *  - `always` — icon + label at every width.
   *  - `icon` — icon only at every width (label in a11y tree + tooltip).
   */
  labels?: 'responsive' | 'always' | 'icon';
  className?: string;
}

/**
 * The shared tabbed record-detail primitive — a professional
 * accounting-workspace tab strip (think a browser's tab bar), sitting
 * between `RecordPageHeader` and the tab panels on a full-page record.
 *
 * Design-system fit:
 *  - icon-led (global UX pass): every tab carries a semantic icon; the text
 *    label collapses to icon-only below `lg` so a dense strip
 *    (Overview / Stock / Purchasing / Sales / Traceability / Accounting /
 *    Documents / Activity) stays one coherent row instead of pushing the page
 *    wider or wrapping. The full wording is always reachable — it stays in the
 *    accessibility tree (`sr-only`) and appears in a deep-green tooltip on
 *    hover/focus, with the count spelled out ("12 related documents");
 *  - the active tab is unmistakable: medium→semibold label, `text-foreground`,
 *    and a 2px brand-green underline that overlaps the strip hairline. It is
 *    never signalled by colour alone — `aria-selected`, the underline and the
 *    roving focus ring all move together;
 *  - keyboard: native roving-tabindex via the ARIA tablist, `Home`/`End`
 *    and arrow keys move between tabs, `focus-visible` ring on the tab;
 *  - responsive: the strip scrolls horizontally **only when the tabs don't
 *    fit** (`overflow-x-auto` + `no-scrollbar`), and the active tab is
 *    scrolled into view; it never widens the page.
 *
 * Only pass tabs that have real content — callers filter their tab list
 * before handing it over; this component renders exactly what it's given.
 *
 * Panels are kept mounted and toggled with the `hidden` attribute, so a
 * half-typed value or a scroll position survives a round-trip to another
 * tab, and in-page anchors / find-in-page still reach inactive content.
 */
export function RecordTabs({
  tabs,
  urlParam,
  embedded = false,
  ariaLabel = 'Record sections',
  labels = 'responsive',
  className,
}: RecordTabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => tabs.map((t) => t.value), [tabs]);
  const syncUrl = Boolean(urlParam) && !embedded;

  const urlValue = syncUrl ? searchParams.get(urlParam as string) : null;
  const [internal, setInternal] = useState(() => (urlValue && values.includes(urlValue) ? urlValue : values[0]));

  // Keep a valid active tab if the URL changes underneath us or the tab set shrinks.
  const active = (() => {
    if (syncUrl && urlValue && values.includes(urlValue)) return urlValue;
    if (values.includes(internal)) return internal;
    return values[0];
  })();

  const select = useCallback(
    (next: string) => {
      setInternal(next);
      if (syncUrl) {
        setSearchParams(
          (prev) => {
            const params = new URLSearchParams(prev);
            if (next === values[0]) params.delete(urlParam as string);
            else params.set(urlParam as string, next);
            return params;
          },
          { replace: true },
        );
      }
    },
    [syncUrl, setSearchParams, urlParam, values],
  );

  const activeIndex = Math.max(0, values.indexOf(active));

  // Scroll the active trigger into view when it changes (horizontal-scroll case).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab-value="${CSS.escape(active)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const { key } = event;
    let nextIndex: number | null = null;
    if (key === 'ArrowRight' || key === 'ArrowDown') nextIndex = (activeIndex + 1) % values.length;
    else if (key === 'ArrowLeft' || key === 'ArrowUp') nextIndex = (activeIndex - 1 + values.length) % values.length;
    else if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = values.length - 1;
    if (nextIndex == null) return;
    event.preventDefault();
    const nextValue = values[nextIndex];
    select(nextValue);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tab-value="${CSS.escape(nextValue)}"]`)
      ?.focus();
  }

  if (tabs.length === 0) return null;

  const labelClass =
    labels === 'always' ? '' : labels === 'icon' ? 'sr-only' : 'sr-only lg:not-sr-only';

  return (
    <div className={cn('flex min-w-0 flex-col gap-6', className)} data-slot="record-tabs">
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="no-scrollbar -mb-px flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => {
          const selected = tab.value === active;
          const Icon = tab.icon ?? resolveTabIcon(tab.value, tab.label);
          const hasCount = tab.count != null && tab.count > 0;
          const tooltipCount = tab.hint ?? resolveTabHint(tab.value, tab.label, tab.count);
          return (
            <Tooltip key={tab.value}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    role="tab"
                    id={`${baseId}-tab-${tab.value}`}
                    data-tab-value={tab.value}
                    aria-selected={selected}
                    aria-controls={`${baseId}-panel-${tab.value}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(tab.value)}
                    className={cn(
                      'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0',
                      selected
                        ? 'border-brand font-semibold text-foreground'
                        : 'border-transparent font-medium text-muted-foreground hover:border-border hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className={labelClass}>{tab.label}</span>
                    {hasCount ? (
                      <span
                        className={cn(
                          'ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[0.6875rem] font-semibold tabular-nums',
                          selected ? 'bg-brand-muted text-brand' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                }
              />
              <TooltipContent variant="brand" side="bottom" className="flex flex-col gap-0.5">
                <span className="font-semibold">{tab.label}</span>
                {tooltipCount ? <span className="opacity-90">{tooltipCount}</span> : null}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.value}
          role="tabpanel"
          id={`${baseId}-panel-${tab.value}`}
          aria-labelledby={`${baseId}-tab-${tab.value}`}
          hidden={tab.value !== active}
          tabIndex={0}
          className="flex min-w-0 flex-col gap-6 focus-visible:outline-none"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
