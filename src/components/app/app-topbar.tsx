import { Link, useLocation } from 'react-router-dom';
import { Fragment } from 'react';

import { GlobalSearch } from '@/components/app/global-search';
import { NotificationMenu } from '@/components/app/notification-menu';
import { UserMenu } from '@/components/app/user-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/shadcn/breadcrumb';
import { Separator } from '@/components/ui/shadcn/separator';
import { SidebarTrigger } from '@/components/ui/shadcn/sidebar';
import { segmentLabels } from '@/lib/app/navigation';

function labelFor(segment: string) {
  return (
    segmentLabels[segment] ??
    segment
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

/**
 * Ported from accounting-v0-frontend/components/app/app-topbar.tsx.
 * next/navigation's usePathname swapped for react-router-dom's
 * useLocation; breadcrumb root is "/" (Dashboard) instead of v0's "/app"
 * since this app has no /app path prefix.
 */
export function AppTopbar() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  const crumbs = segments.map((segment, index) => ({
    label: labelFor(segment),
    href: `/${segments.slice(0, index + 1).join('/')}`,
    isLast: index === segments.length - 1,
  }));

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-xl sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 !h-5" />

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:block">
            <BreadcrumbLink render={<Link to="/" />}>
              Dashboard
            </BreadcrumbLink>
          </BreadcrumbItem>
          {crumbs.map((crumb) => (
            <Fragment key={crumb.href}>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem className="min-w-0">
                {crumb.isLast ? (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link to={crumb.href} />}
                    className="hidden sm:inline-flex"
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-1">
        <GlobalSearch />
        <NotificationMenu />
        <UserMenu />
      </div>
    </header>
  );
}
