import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { Wordmark } from '@/components/app/wordmark';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/shadcn/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/shadcn/sidebar';
import {
  activeAccordionGroupTitle,
  groupHoldsActive,
  isNavItemActive,
} from '@/lib/app/navigation';
import { useVisibleNavGroups } from '@/features/auth/hooks/useVisibleNavGroups';
import { CURRENT_FINANCIAL_YEAR, CURRENT_PERIOD_LABEL } from '@/lib/app/format';
import { cn } from '@/lib/utils';

/**
 * Ported from accounting-v0-frontend/components/app/app-sidebar.tsx.
 * next/link + next/navigation's usePathname swapped for react-router-dom's
 * Link/useLocation — everything else (structure, classes) unchanged.
 * warning/negative badge tones use the status-* Tailwind keys (see
 * tailwind.config.js), not the bare warning/negative already owned by this
 * app's financial-number color system.
 */
const badgeToneClass = {
  brand: 'bg-brand-muted text-brand',
  warning: 'bg-status-warning-muted text-status-warning',
  negative: 'bg-status-negative-muted text-status-negative',
};

export function AppSidebar() {
  const { pathname } = useLocation();
  const navGroups = useVisibleNavGroups();

  // True accordion: at most one group open at a time. Re-synced to
  // whichever group holds the current route on every navigation, so
  // clicking a sidebar link (or typing a URL) always reveals the right
  // section — a manual click on a *different* group's header (with no
  // navigation yet) is handled separately below and isn't overridden by
  // this effect, since it only fires when `pathname` actually changes.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    const activeTitle = activeAccordionGroupTitle(navGroups, pathname);
    if (activeTitle) {
      setOpenGroup(activeTitle);
    }
  }, [pathname, navGroups]);

  return (
    <Sidebar
      collapsible="icon"
      /*
       * Subtle Vertex-green vertical edge on the sidebar's right boundary
       * (docs/CURRENT_TASKS.md #2). The container is position:fixed and
       * does not itself scroll, so this 1px line stays put while
       * SidebarContent scrolls behind it, and sits just inside the
       * neutral border-r so it never fights the scrollbar (which lives on
       * the inner content, not this edge).
       */
      className="border-r border-sidebar-border after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-30 after:w-px after:bg-brand-outline"
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          to="/"
          className="flex items-center gap-2 px-1 py-1.5 group-data-[collapsible=icon]:justify-center"
        >
          <Wordmark className="group-data-[collapsible=icon]:hidden" />
          <span
            aria-hidden="true"
            className="hidden size-7 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground group-data-[collapsible=icon]:flex"
          >
            V
          </span>
          <span className="sr-only">Vertex Accounting Solutions</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-1">
        {navGroups.map((group) => {
          const holdsActive = groupHoldsActive(group, pathname);

          // The single-item Overview and Help groups render flat.
          if (group.items.length === 1) {
            const item = group.items[0];
            const active = isNavItemActive(pathname, item);
            return (
              <SidebarGroup key={group.title} className="py-1">
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        render={
                          <Link to={item.href}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        }
                      />
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          const open = openGroup === group.title;

          return (
            <Collapsible
              key={group.title}
              open={open}
              onOpenChange={(next) => setOpenGroup(next ? group.title : null)}
              className="group/nav-group"
            >
              <SidebarGroup className="py-1">
                <CollapsibleTrigger
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium tracking-wider text-sidebar-foreground/60 uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                    'group-data-[collapsible=icon]:hidden',
                    // Section holding the current page reads as its own row
                    // (soft accent fill, full-strength label) so the active
                    // category is legible at a glance, not just implied by
                    // its children — distinct from an ordinary collapsed
                    // group (muted label, no fill) and from a group a user
                    // merely expanded to browse (rotated chevron only).
                    holdsActive && 'bg-sidebar-accent/60 font-semibold text-sidebar-foreground',
                  )}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 shrink-0 transition-transform duration-200 group-data-open/nav-group:rotate-90',
                      holdsActive && 'text-brand',
                    )}
                  />
                  <span className="flex-1 text-left">{group.title}</span>
                </CollapsibleTrigger>

                <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const active = isNavItemActive(pathname, item);
                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              isActive={active}
                              tooltip={item.title}
                              render={
                                <Link to={item.href}>
                                  <item.icon />
                                  <span>{item.title}</span>
                                </Link>
                              }
                            />
                            {item.badge ? (
                              <SidebarMenuBadge
                                className={cn(
                                  'rounded-full px-1.5 text-[10px] font-semibold',
                                  badgeToneClass[item.badgeTone ?? 'brand'],
                                )}
                              >
                                {item.badge}
                              </SidebarMenuBadge>
                            ) : null}
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>

                {/* Collapsed rail: icons only, no group chrome. */}
                <SidebarGroupContent className="hidden group-data-[collapsible=icon]:block">
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={`rail-${item.href}`}>
                        <SidebarMenuButton
                          isActive={isNavItemActive(pathname, item)}
                          tooltip={item.title}
                          render={
                            <Link to={item.href}>
                              <item.icon />
                              <span>{item.title}</span>
                            </Link>
                          }
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col gap-0.5 px-2 py-1">
          <span className="text-xs font-medium text-sidebar-foreground">
            {CURRENT_PERIOD_LABEL}
          </span>
          <span className="text-xs text-sidebar-foreground/60">
            Financial year {CURRENT_FINANCIAL_YEAR}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
