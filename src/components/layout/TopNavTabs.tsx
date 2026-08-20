import { useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { navigation, type NavSection } from '@/config/navigation';
import { Icon } from '@/components/ui/Icon';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/utils/cn';

function isSectionActive(section: NavSection, pathname: string): boolean {
  return section.items.some((item) =>
    item.path === '/' ? pathname === '/' : pathname === item.path,
  );
}

/** Shared classes for the pill/underline on the active top-level tab (Accent Contrast Rule). */
const activeTabClasses = 'bg-primary text-on-accent';
const inactiveTabClasses = 'text-text-secondary hover:bg-panel hover:text-text-primary';
/** Visible in both themes; only shown on keyboard focus, not mouse click. */
const focusRingClasses =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function SingleRouteTab({ section }: { section: NavSection }) {
  const item = section.items[0];
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-xs rounded-full px-md py-sm text-sm font-medium transition-colors',
          focusRingClasses,
          isActive ? activeTabClasses : inactiveTabClasses,
        )
      }
    >
      <Icon name={section.icon} size={16} />
      {section.tabLabel ?? section.section}
    </NavLink>
  );
}

function DropdownTab({ section }: { section: NavSection }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isSectionActive(section, pathname);

  useClickOutside(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-xs rounded-full px-md py-sm text-sm font-medium transition-colors',
          focusRingClasses,
          active ? activeTabClasses : inactiveTabClasses,
        )}
      >
        <Icon name={section.icon} size={16} />
        {section.tabLabel ?? section.section}
        <Icon name="chevronDown" size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={section.tabLabel ?? section.section}
          className="absolute left-0 top-full z-50 mt-xs min-w-[14rem] rounded-md border border-border bg-panel py-xs shadow-md"
        >
          {section.items.map((item) => (
            <NavLink
              key={item.path}
              role="menuitem"
              to={item.path}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-sm px-md py-sm text-sm transition-colors',
                  focusRingClasses,
                  isActive
                    ? 'bg-primary text-on-accent'
                    : 'text-text-secondary hover:bg-background hover:text-text-primary',
                )
              }
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Desktop horizontal row of top-level domain tabs (docs/DESIGN_SYSTEM.md
 * § Navigation Layout). Single-route sections navigate directly;
 * multi-route sections open a dropdown listing their children. Hidden
 * below the md breakpoint in favor of MobileNavMenu.
 */
export function TopNavTabs() {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-xs md:flex">
      {navigation.map((section) =>
        section.items.length > 1 ? (
          <DropdownTab key={section.section} section={section} />
        ) : (
          <SingleRouteTab key={section.section} section={section} />
        ),
      )}
    </nav>
  );
}
