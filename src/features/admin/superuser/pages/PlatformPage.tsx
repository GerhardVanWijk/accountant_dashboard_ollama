import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { platformAdminService } from '../services';
import type { PlatformMetrics } from '../types';

/**
 * Platform page — only metrics Vertex can actually derive. Infrastructure
 * usage (Supabase storage / egress, Cloudflare bandwidth, database CPU) is
 * NOT surfaced here; it lives in the hosting provider dashboards and this
 * app has no API to it.
 */
export function PlatformPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformAdminService.getMetrics().then(setMetrics).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const buildMode = import.meta.env.MODE;

  return (
    <>
      <PageHeader title="Platform" description="What Vertex can measure about itself." />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!metrics && !error ? (
        <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      ) : metrics ? (
        <>
          <SectionCard title="Tenancy">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Stat label="Companies" value={metrics.totalClients} />
              <Stat label="Active companies" value={metrics.activeClients} />
              <Stat label="Suspended companies" value={metrics.suspendedClients} />
              <Stat label="Users" value={metrics.totalUsers} />
              <Stat label="Superusers" value={metrics.superusers} />
              <Stat label="Managed subscriptions" value={metrics.managedSubscriptions} />
            </dl>
          </SectionCard>

          <SectionCard title="Build">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted-foreground">Build mode</dt>
              <dd className="capitalize">{buildMode}</dd>
              <dt className="text-muted-foreground">Latest DB migration</dt>
              <dd>0070 — Superuser Platform Console</dd>
            </dl>
          </SectionCard>

          <SectionCard title="Platform usage metrics" bodyClassName="p-5 text-sm text-muted-foreground">
            Detailed infrastructure usage — storage, bandwidth, egress, database load — is managed through the hosting
            provider dashboards (Supabase and Cloudflare) and is not mirrored here. No estimated or placeholder figures
            are shown.
          </SectionCard>
        </>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}
