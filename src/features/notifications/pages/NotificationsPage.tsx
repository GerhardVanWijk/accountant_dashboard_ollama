import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Check, Loader2, SlidersHorizontal } from 'lucide-react';
import type { NotificationCategory } from '@/types';
import { NOTIFICATION_CATEGORY_LABELS } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { BellIcon, MailIcon, TriangleAlertIcon } from 'lucide-react';
import { StatTileGrid } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { EnumSelect } from '@/components/app/combobox';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/shadcn/empty';
import { useLogSensitiveAccess } from '@/features/auth/hooks/useLogSensitiveAccess';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationRow } from '../components/NotificationRow';

export function NotificationsPage() {
  useLogSensitiveAccess('Notifications');
  const [showResolved, setShowResolved] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | ''>('');
  const { notifications, unreadCount, loading, error, refetch, markRead, markAllRead } = useNotifications({
    evaluate: true,
    includeResolved: showResolved,
    limit: 200,
  });

  const filtered = useMemo(
    () => (category ? notifications.filter((n) => n.category === category) : notifications),
    [notifications, category],
  );

  const openItems = notifications.filter((n) => n.status === 'open');
  const criticalCount = openItems.filter((n) => n.severity === 'critical').length;
  const categoriesPresent = useMemo(
    () => [...new Set(notifications.map((n) => n.category))].sort(),
    [notifications],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Conditions in your workspace that need attention — deadlines, risks, exceptions, failures and security events. Routine bookkeeping activity is not shown here; see the Audit trail for that."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link to="/settings" />}>
              <SlidersHorizontal data-icon="inline-start" />
              Preferences
            </Button>
            <Button size="sm" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              <Check data-icon="inline-start" />
              Mark all read
            </Button>
          </div>
        }
      />

      <StatTileGrid
        columns={3}
        metrics={[
          { label: 'Open', value: String(openItems.length), hint: 'Active conditions', icon: BellIcon },
          { label: 'Unread', value: String(unreadCount), hint: 'Attention-worthy', icon: MailIcon },
          { label: 'Critical', value: String(criticalCount), hint: 'Open critical items', tone: criticalCount > 0 ? 'negative' : 'default', icon: TriangleAlertIcon },
        ]}
      />

      <SectionCard title="All notifications" bodyClassName="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <EnumSelect
            aria-label="Category"
            value={category}
            onValueChange={(v) => setCategory((v as NotificationCategory) || '')}
            options={[
              { value: '', label: 'All categories' },
              ...categoriesPresent.map((c) => ({ value: c, label: NOTIFICATION_CATEGORY_LABELS[c] })),
            ]}
          />
          <Button
            variant={showResolved ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowResolved((v) => !v)}
          >
            {showResolved ? 'Showing resolved' : 'Show resolved'}
          </Button>
        </div>

        {loading ? (
          <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading notifications…</p>
          </div>
        ) : error ? (
          <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="py-12">
            <BellRing className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <EmptyTitle>{showResolved || category ? 'Nothing matches' : 'Nothing needs your attention'}</EmptyTitle>
            <EmptyDescription>
              {showResolved || category
                ? 'Adjust the filters above.'
                : 'When a deadline, risk or exception comes up, it will appear here.'}
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {filtered.map((n) => (
              <NotificationRow key={n.id} notification={n} onMarkRead={(id) => void markRead(id)} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
