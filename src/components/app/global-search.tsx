import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

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

/**
 * Ported from accounting-v0-frontend/components/app/global-search.tsx,
 * trimmed to the "Screens" group only for M0 — v0's Invoices/Accounts/
 * Customers-and-suppliers groups searched mock business data
 * (lib/app/mock/sales.ts etc.), which is out of scope for a shell-only
 * phase. Those return once the corresponding module is ported and there
 * is a real hook to search against, instead of reintroducing mock data
 * here. next/navigation's useRouter swapped for react-router-dom's
 * useNavigate.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const navGroups = useVisibleNavGroups();
  const [open, setOpen] = useState(false);

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

  const screens = useMemo(
    () =>
      navGroups.flatMap((group) =>
        group.items.map((item) => ({
          ...item,
          section: group.title,
        })),
      ),
    [navGroups],
  );

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
        description="Find a screen"
      >
        <CommandInput placeholder="Search screens…" />
        <CommandList>
          <CommandEmpty>No matches found.</CommandEmpty>

          <CommandGroup heading="Screens">
            {screens.map((screen) => (
              <CommandItem
                key={screen.href}
                value={`${screen.title} ${screen.section}`}
                onSelect={() => go(screen.href)}
              >
                <screen.icon />
                <span>{screen.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {screen.section}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
