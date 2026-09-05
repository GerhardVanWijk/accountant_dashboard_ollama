import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ClipboardCheckIcon,
  ClipboardListIcon,
  CornerDownLeft,
  CreditCardIcon,
  FileSignatureIcon,
  FileTextIcon,
  Loader2,
  PackageCheckIcon,
  PackageIcon,
  PackageXIcon,
  ReceiptIcon,
  ScrollTextIcon,
  Search,
  UsersRound,
} from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/shadcn/command';
import { Kbd } from '@/components/ui/shadcn/kbd';
import { useVisibleNavGroups } from '@/features/auth/hooks/useVisibleNavGroups';
import { cn } from '@/lib/utils';
import {
  useGlobalSearchRecords,
  type GlobalSearchRecordType,
} from '@/components/app/global-search-records';

/**
 * Global command palette (⌘/Ctrl-K or the header button).
 *
 * A compact command palette (docs brief Part A): ~680px wide, results
 * capped at 60vh and scrolling inside their own region, one clean surface
 * with the search field integrated into the top edge (no nested grey box),
 * tight grouped rows, a subtle brand-green selected state and a keyboard
 * hint footer.
 *
 * The navigation index is available instantly; product / customer /
 * supplier records load once on first open and are filtered client-side by
 * cmdk thereafter, so typing never triggers a fetch. Before the user types,
 * the palette shows a short "Jump to" list of common destinations rather
 * than repeating the input's own placeholder sentence.
 */
const RECORD_META: Record<
  GlobalSearchRecordType,
  { icon: typeof PackageIcon; label: string; heading: string }
> = {
  product: { icon: PackageIcon, label: 'Product', heading: 'Products' },
  customer: { icon: UsersRound, label: 'Customer', heading: 'Customers' },
  supplier: { icon: Building2, label: 'Supplier', heading: 'Suppliers' },
  delivery_note: { icon: PackageCheckIcon, label: 'Delivery note', heading: 'Delivery notes' },
  return_note: { icon: PackageXIcon, label: 'Return note', heading: 'Return notes' },
  invoice: { icon: FileTextIcon, label: 'Invoice', heading: 'Invoices' },
  bill: { icon: CreditCardIcon, label: 'Bill', heading: 'Bills' },
  quote: { icon: FileSignatureIcon, label: 'Quote', heading: 'Quotes' },
  sales_order: { icon: ClipboardListIcon, label: 'Sales order', heading: 'Sales orders' },
  purchase_order: { icon: ClipboardCheckIcon, label: 'Purchase order', heading: 'Purchase orders' },
  credit_note: { icon: ReceiptIcon, label: 'Credit note', heading: 'Credit notes' },
  journal_entry: { icon: ScrollTextIcon, label: 'Journal entry', heading: 'Journal entries' },
};

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const navGroups = useVisibleNavGroups();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { records, loading, error } = useGlobalSearchRecords(open);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset the query each time the palette closes so it reopens clean.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const screens = useMemo(
    () =>
      navGroups.flatMap((group) =>
        group.items
          .filter((item) => !item.comingSoon)
          .map((item) => ({ ...item, section: group.title })),
      ),
    [navGroups],
  );

  /** A short list of common destinations for the pre-typing state. */
  const jumpTo = useMemo(() => {
    const seen = new Set<string>();
    const picks: typeof screens = [];
    for (const group of navGroups) {
      const first = group.items.find((i) => !i.comingSoon);
      if (first && !seen.has(first.href)) {
        seen.add(first.href);
        picks.push({ ...first, section: group.title });
      }
      if (picks.length >= 6) break;
    }
    return picks;
  }, [navGroups]);

  const recordsByType = useMemo(() => {
    return ([
      'product',
      'customer',
      'supplier',
      'delivery_note',
      'return_note',
      'invoice',
      'bill',
      'quote',
      'sales_order',
      'purchase_order',
      'credit_note',
      'journal_entry',
    ] as GlobalSearchRecordType[]).map((type) => ({
      type,
      items: records.filter((r) => r.type === type),
    }));
  }, [records]);

  const hasQuery = query.trim().length > 0;

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn(
          'h-9 justify-start gap-2 px-2.5 font-normal text-muted-foreground',
          className,
        )}
      >
        <Search data-icon="inline-start" />
        <span className="hidden sm:inline">Search everything</span>
        <Kbd className="ml-auto hidden lg:inline-flex">⌘K</Kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search pages, products, customers and suppliers"
      >
        <CommandInput
          placeholder="Search pages, products, customers and suppliers…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!hasQuery ? (
            <CommandGroup heading="Jump to">
              {jumpTo.map((screen) => (
                <CommandItem
                  key={screen.href}
                  value={`jump ${screen.title}`}
                  onSelect={() => go(screen.href)}
                >
                  <screen.icon />
                  <span>{screen.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{screen.section}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : (
            <CommandEmpty>
              {loading ? 'Searching…' : `No results for “${query.trim()}”`}
            </CommandEmpty>
          )}

          {hasQuery && (
            <CommandGroup heading="Pages">
              {screens.map((screen) => (
                <CommandItem
                  key={screen.href}
                  value={`${screen.title} ${screen.section} page`}
                  onSelect={() => go(screen.href)}
                >
                  <screen.icon />
                  <span>{screen.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{screen.section}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {hasQuery &&
            recordsByType.map(({ type, items }) => {
              if (items.length === 0) return null;
              const meta = RECORD_META[type];
              return (
                <CommandGroup key={type} heading={meta.heading}>
                  {items.map((record) => (
                    <CommandItem
                      key={`${type}-${record.id}`}
                      value={record.keywords}
                      onSelect={() => go(record.href)}
                    >
                      <meta.icon />
                      <span className="font-medium">{record.code}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{record.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {meta.label}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}

          {hasQuery && loading && (
            <div
              role="status"
              className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Loading products, customers and suppliers…
            </div>
          )}
          {hasQuery && error && (
            <p role="alert" className="px-3 py-3 text-xs text-destructive">
              Couldn’t load records to search. Page navigation still works.
            </p>
          )}
        </CommandList>

        <div className="flex shrink-0 items-center gap-4 border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>
            Open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd>
            Close
          </span>
        </div>
      </CommandDialog>
    </>
  );
}
