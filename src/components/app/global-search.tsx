import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, PackageIcon, Search, UsersRound } from 'lucide-react';

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
 * Global command palette (⌘/Ctrl-K or the header button). Navigation index
 * is available instantly; product / customer / supplier records load once
 * on first open and are filtered client-side by cmdk thereafter, so typing
 * never triggers a fetch. Record groups only render once the user has typed
 * something, keeping the initial view a short, scannable page list.
 */
const RECORD_META: Record<
  GlobalSearchRecordType,
  { icon: typeof PackageIcon; label: string; heading: string }
> = {
  product: { icon: PackageIcon, label: 'Product', heading: 'Products' },
  customer: { icon: UsersRound, label: 'Customer', heading: 'Customers' },
  supplier: { icon: Building2, label: 'Supplier', heading: 'Suppliers' },
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

  const recordsByType = useMemo(() => {
    return (['product', 'customer', 'supplier'] as GlobalSearchRecordType[]).map((type) => ({
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
        className="sm:max-w-xl"
      >
        <CommandInput
          placeholder="Search pages, products, customers and suppliers…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!hasQuery ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Search pages, products, customers and suppliers
            </p>
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
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{record.code}</span>
                        <span className="truncate text-xs text-muted-foreground">{record.name}</span>
                      </div>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{meta.label}</span>
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
      </CommandDialog>
    </>
  );
}
