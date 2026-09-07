import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { Notification } from '@/types';
import { NOTIFICATION_CATEGORY_LABELS } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/app/format';
import { SEVERITY_PRESENTATION } from '../notificationPresentation';

export interface NotificationRowProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  /** Compact rendering for the navbar popover. */
  dense?: boolean;
  /** Called when the user opens the related item (e.g. to close the popover). */
  onNavigate?: () => void;
}

export function NotificationRow({ notification, onMarkRead, dense, onNavigate }: NotificationRowProps) {
  const s = SEVERITY_PRESENTATION[notification.severity];
  const Icon = s.icon;
  const resolved = notification.status === 'resolved';

  return (
    <div
      className={cn(
        'relative flex gap-3 border-b border-border/60 last:border-b-0',
        dense ? 'px-3 py-2.5' : 'px-4 py-3.5',
        notification.isUnread && !resolved ? 'bg-primary/[0.03]' : undefined,
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-0.5', resolved ? 'bg-transparent' : s.accentClass)} />
      <Icon className={cn('mt-0.5 size-4 shrink-0', resolved ? 'text-muted-foreground' : s.iconClass)} aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium', resolved ? 'text-muted-foreground' : 'text-foreground')}>
            {notification.title}
          </p>
          {notification.isUnread && !resolved && (
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
          )}
        </div>

        {notification.body && !dense && (
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{notification.body}</p>
        )}

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {!dense && (
            <Badge variant="outline" className={cn('h-4 px-1.5 text-[10px]', resolved ? '' : s.badgeClass)}>
              {resolved ? 'Resolved' : s.label}
            </Badge>
          )}
          <span>{NOTIFICATION_CATEGORY_LABELS[notification.category]}</span>
          <span aria-hidden="true">·</span>
          <span title={notification.lastSeenAt}>
            {resolved && notification.resolvedAt
              ? `resolved ${formatRelative(notification.resolvedAt)}`
              : formatRelative(notification.firstSeenAt)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-3">
          {notification.actionUrl && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              render={<Link to={notification.actionUrl} />}
              onClick={onNavigate}
            >
              Open related item
            </Button>
          )}
          {notification.isUnread && !resolved && (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Check className="size-3" aria-hidden="true" />
              Mark read
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
