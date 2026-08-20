import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';
import { ThemeToggle } from './ThemeToggle';
import { TopNavTabs } from './TopNavTabs';
import { MobileNavMenu } from './MobileNavMenu';

/** Visible in both themes; only shown on keyboard focus, not mouse click. */
const focusRingClasses =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function SearchControl() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        aria-label="Search"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-panel hover:text-text-primary',
          focusRingClasses,
        )}
      >
        <Icon name="search" size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-xs">
          <input
            ref={inputRef}
            type="search"
            aria-label="Search"
            placeholder="Search…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
            className={cn(
              'w-56 rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary shadow-md',
              focusRingClasses,
            )}
          />
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-panel hover:text-text-primary',
          focusRingClasses,
        )}
      >
        <Icon name="account" size={20} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-xs min-w-[10rem] rounded-md border border-border bg-panel py-xs shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className={cn(
              'flex w-full items-center gap-sm px-md py-sm text-left text-sm text-text-secondary hover:bg-background hover:text-text-primary',
              focusRingClasses,
            )}
          >
            <Icon name="logout" size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Fixed horizontal top bar — replaces the retired left Sidebar
 * (docs/DESIGN_SYSTEM.md § Navigation Layout / docs/DO_NOT_BREAK.md
 * "Re-introduce a persistent left sidebar" rule). Left: brand. Center:
 * top-level domain tabs (TopNavTabs, desktop only). Right: search, theme
 * toggle, account menu — collapsing to a hamburger + MobileNavMenu
 * slide-over below the md (768px) breakpoint.
 */
export function Topbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-md border-b border-border bg-panel px-md md:px-lg">
      <Link to="/" className="flex shrink-0 items-center text-sm font-semibold text-text-primary">
        Accounting Suite
      </Link>

      <div className="min-w-0 flex-1">
        <TopNavTabs />
      </div>

      <div className="flex shrink-0 items-center gap-sm">
        <SearchControl />
        <div className="hidden items-center gap-sm md:flex">
          <ThemeToggle />
          <AccountMenu />
        </div>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(true)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary md:hidden',
            focusRingClasses,
          )}
        >
          <Icon name="menu" size={20} />
        </button>
      </div>

      <MobileNavMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </header>
  );
}
