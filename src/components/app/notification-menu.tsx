import { Link } from 'react-router-dom';
import { useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { Separator } from '@/components/ui/shadcn/separator';
import { formatRelative } from '@/lib/app/format';
import { notifications as seedNotifications } from '@/lib/app/mock/admin';
import { cn } from '@/lib/utils';

/**
 * Ported from accounting-v0-frontend/components/app/notification-menu.tsx.
 * This app has no notifications backend yet, so this stays on placeholder
 * data (lib/app/mock/admin.ts) until that's built — a later phase, not M0.
 * severity-based colors use the status-* Tailwind keys, not the bare
 * info/positive/warning/negative already owned by this app's financial
 * number-coloring system.
 */
const severityIcon = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  critical: AlertTriangle,
};

const severityClass = {
  info: 'text-status-info',
  success: 'text-status-positive',
  warning: 'text-status-warning',
  critical: 'text-status-negative',
};

export function NotificationMenu() {
  const [items, setItems] = useState(seedNotifications);
  const unread = items.filter((item) => !item.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`Notifications, ${unread} unread`}
          >
            <Bell />
            {unread > 0 ? (
              <span
                aria-hidden="true"
                className="figure absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-status-negative text-[10px] font-semibold text-background"
              >
                {unread}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setItems((prev) => prev.map((n) => ({ ...n, read: true })))
              }
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        <Separator />

        <ul className="max-h-80 overflow-y-auto">
          {items.slice(0, 6).map((item) => {
            const Icon = severityIcon[item.severity];
            return (
              <li key={item.id} className="border-b border-border last:border-0">
                <Link
                  to={item.href ?? '/'}
                  className={cn(
                    'flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/60',
                    !item.read && 'bg-muted/30',
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn('mt-0.5 size-4 shrink-0', severityClass[item.severity])}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-pretty">
                      {item.title}
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                      {formatRelative(item.timestamp)}
                    </span>
                  </span>
                  {!item.read ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
