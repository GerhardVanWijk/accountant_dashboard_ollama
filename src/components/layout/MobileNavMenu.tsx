import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { navigation } from '@/config/navigation';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from './ThemeToggle';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';

export interface MobileNavMenuProps {
  open: boolean;
  onClose: () => void;
}

/** Visible in both themes; only shown on keyboard focus, not mouse click. */
const focusRingClasses =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * Full-height slide-over nav for below the md (768px) breakpoint, per
 * docs/DESIGN_SYSTEM.md § Navigation Layout — same section/item hierarchy
 * as the desktop top bar, single column, 44px-minimum touch targets.
 */
export function MobileNavMenu({ open, onClose }: MobileNavMenuProps) {
  const { pathname } = useLocation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const logout = useAuthStore((s) => s.logout);

  // Close on route change.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col overflow-y-auto border-l border-border bg-panel shadow-lg"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-md">
          <span className="text-sm font-semibold text-text-primary">Menu</span>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary',
              focusRingClasses,
            )}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-lg p-md">
          {navigation.map((section) => (
            <div key={section.section}>
              {section.items.length > 1 && (
                <p className="flex items-center gap-xs px-sm pb-xs text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <Icon name={section.icon} size={14} />
                  {section.tabLabel ?? section.section}
                </p>
              )}
              <ul className="flex flex-col gap-xs">
                {section.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex min-h-[44px] items-center gap-sm rounded-md px-sm text-sm font-medium transition-colors',
                          focusRingClasses,
                          isActive
                            ? 'bg-primary text-on-accent'
                            : 'text-text-secondary hover:bg-background hover:text-text-primary',
                        )
                      }
                    >
                      <Icon name={item.icon} size={18} />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex shrink-0 flex-col gap-md border-t border-border p-md">
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            className={cn(
              'flex min-h-[44px] items-center justify-center gap-xs rounded-md border border-border px-sm text-sm text-text-secondary hover:border-primary hover:text-primary',
              focusRingClasses,
            )}
          >
            <Icon name="logout" size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
