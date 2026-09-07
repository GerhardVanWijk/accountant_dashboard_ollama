import { Link } from 'react-router-dom';
import { Bell, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/shadcn/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/shadcn/dropdown-menu';
import { Separator } from '@/components/ui/shadcn/separator';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { NotificationRow } from '@/features/notifications/components/NotificationRow';

/**
 * Navbar notification bell (migration 0073). Shows the count of unread,
 * attention-worthy conditions and a popover of the highest-priority items.
 * There is exactly one bell in the app — this component, mounted once in
 * AppTopbar. Its data (feed, unread count, targeting) is company- and
 * permission-scoped by the `notification_feed` / `notification_unread_count`
 * RPCs, so it renders nothing for a signed-out user or a suspended
 * workspace. No flashing/pulsing — a static count is the only affordance.
 */
export function NotificationMenu() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications({ evaluate: true, limit: 8 });
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} />}
        className="relative"
      >
        <Bell />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none',
              notifications.some((n) => n.severity === 'critical' && n.isUnread)
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground',
            )}
          >
            {badge}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <Separator />

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-center">
            <Bell className="size-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-xs text-muted-foreground">Nothing in your workspace needs attention right now.</p>
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto">
            {notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} dense onMarkRead={(id) => void markRead(id)} />
            ))}
          </div>
        )}

        <Separator />
        <Link
          to="/notifications"
          className="block px-3 py-2.5 text-center text-xs font-medium text-primary hover:underline"
        >
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
