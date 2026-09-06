import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { MetricCard } from '@/components/app/metric-card';
import { platformAdminService } from '../services';
import type { PlatformMetrics } from '../types';

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', growth: 'Growth', premium: 'Premium' };

export function OverviewPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformAdminService
      .getMetrics()
      .then(setMetrics)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <>
      <PageHeader
        title="Vertex Platform Administration"
        description="Manage customers, subscriptions, access and platform security."
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {!metrics && !error && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading platform metrics…</p>
        </div>
      )}

      {metrics && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Total clients" formattedValue={String(metrics.totalClients)} />
            <MetricCard label="Active clients" formattedValue={String(metrics.activeClients)} />
            <MetricCard
              label="Suspended clients"
              formattedValue={String(metrics.suspendedClients)}
              hint={metrics.suspendedClients > 0 ? 'Members are blocked from these workspaces.' : undefined}
            />
            <MetricCard label="Total users" formattedValue={String(metrics.totalUsers)} hint={`${metrics.superusers} platform superuser(s)`} />
            <MetricCard label="Pending invitations" formattedValue={String(metrics.pendingInvitations)} />
            <MetricCard
              label="Suspended users"
              formattedValue={String(metrics.suspendedUsers)}
            />
          </div>

          <SectionCard
            title="Subscriptions"
            description="Verified Paystack payment data is not connected yet — no revenue, MRR or payment figures are shown."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Active subscriptions" value={metrics.activeSubscriptions} />
              <Stat label="Unmanaged clients" value={metrics.unmanagedClients} hint="No subscription row — grandfathered / full access." />
              {(['starter', 'growth', 'premium'] as const).map((code) => (
                <Stat key={code} label={`${PLAN_LABEL[code]} subscriptions`} value={metrics.byPlan[code] ?? 0} />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Billing (coming soon)" bodyClassName="p-5 text-sm text-muted-foreground">
            <p>
              MRR, payments, failed payments and renewals will appear here once Vertex&rsquo;s Paystack integration is
              live and processing real payments. Until then, subscriptions are either <strong>unmanaged</strong> or a{' '}
              <strong>manual / superuser override</strong>.
            </p>
          </SectionCard>
        </>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
