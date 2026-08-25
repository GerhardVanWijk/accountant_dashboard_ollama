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
import type { NavGroup } from '@/lib/app/navigation';
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
  warning: 'bg-status-warning/15 text-status-warning',
  negative: 'bg-status-negative/15 text-status-negative',
};

function isItemActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupHoldsActive(group: NavGroup, pathname: string) {
  return group.items.some((item) => isItemActive(pathname, item.href));
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const navGroups = useVisibleNavGroups();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
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

      <SidebarContent className="gap-0">
        {navGroups.map((group) => {
          const holdsActive = groupHoldsActive(group, pathname);

          // The single-item Overview and Help groups render flat.
          if (group.items.length === 1) {
            const item = group.items[0];
            const active = isItemActive(pathname, item.href);
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

          return (
            <Collapsible
              key={group.title}
              defaultOpen={group.defaultOpen || holdsActive}
              className="group/nav-group"
            >
              <SidebarGroup className="py-1">
                <CollapsibleTrigger
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium tracking-wide text-sidebar-foreground/60 uppercase transition-colors hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                    'group-data-[collapsible=icon]:hidden',
                  )}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 transition-transform duration-200 group-data-open/nav-group:rotate-90"
                  />
                  <span className="flex-1 text-left">{group.title}</span>
                </CollapsibleTrigger>

                <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const active = isItemActive(pathname, item.href);
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
                          isActive={isItemActive(pathname, item.href)}
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
