import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/shadcn/toggle-group';
import { platformAdminService } from '../services';
import type { PlatformClient } from '../types';
import { ManagementBadge, PlanBadge, SubscriptionStatusBadge } from '../components/PlatformBadges';

type View = 'all' | 'managed' | 'manual' | 'unmanaged';

export function SubscriptionsPage() {
  const [clients, setClients] = useState<PlatformClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('all');

  useEffect(() => {
    platformAdminService.getClients().then(setClients).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const rows = useMemo(() => {
    if (!clients) return [];
    return clients
      .filter((c) => {
        if (view === 'managed') return c.subscription !== null;
        if (view === 'manual') return c.management === 'manual';
        if (view === 'unmanaged') return c.management === 'unmanaged';
        return true;
      })
      .sort((a, b) => a.company.name.localeCompare(b.company.name));
  }, [clients, view]);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Every client's Vertex plan and how it is administered. Paystack is not connected — there are no payment, revenue or MRR figures yet."
      />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <ToggleGroup value={[view]} onValueChange={(v) => v[0] && setView(v[0] as View)} variant="outline" spacing={0} aria-label="Filter">
        {(['all', 'managed', 'manual', 'unmanaged'] as View[]).map((v) => (
          <ToggleGroupItem key={v} value={v} className="h-8 px-3 text-xs capitalize">
            {v}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <SectionCard bodyClassName="p-0">
        {!clients && !error ? (
          <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Plan</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">Management</th>
                  <th className="hidden px-4 py-2.5 font-medium text-muted-foreground lg:table-cell">Period end</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.company.id} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/superuser/clients/${c.company.id}`} className="font-medium text-foreground hover:underline">
                        {c.company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <PlanBadge planCode={c.planCode} />
                    </td>
                    <td className="px-4 py-2.5">
                      <SubscriptionStatusBadge status={c.subscription?.status ?? null} />
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      <ManagementBadge management={c.management} />
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                      {c.subscription?.currentPeriodEnd ?? '—'}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No subscriptions in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
