import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, SearchIcon } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { MetricCard } from '@/components/app/metric-card';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect } from '@/components/app/combobox';
import { platformAdminService } from '../services';
import type { PlatformAuditEvent, PlatformMetrics } from '../types';

/**
 * Platform-wide security & audit. Reads real administrative events across
 * every company (the superuser SELECT policy on audit_log_entries, migration
 * 0070). Only events Vertex actually records are shown — no fabricated
 * metrics.
 */
export function SecurityAuditPage() {
  const [events, setEvents] = useState<PlatformAuditEvent[] | null>(null);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    Promise.all([platformAdminService.getAuditEvents(300), platformAdminService.getMetrics()])
      .then(([e, m]) => {
        setEvents(e);
        setMetrics(m);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const actions = useMemo(() => [...new Set((events ?? []).map((e) => e.action))].sort(), [events]);

  const rows = useMemo(() => {
    if (!events) return [];
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (action && e.action !== action) return false;
      if (q) {
        const hay = `${e.actorEmail ?? ''} ${e.companyName ?? ''} ${e.action} ${e.recordType} ${e.reason ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, search, action]);

  return (
    <>
      <PageHeader
        title="Security & Audit"
        description="Administrative and security events across every Vertex client — user changes, invitations, role changes, subscription overrides, suspensions, company creation."
      />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {metrics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Suspended users" formattedValue={String(metrics.suspendedUsers)} />
          <MetricCard label="Suspended clients" formattedValue={String(metrics.suspendedClients)} />
          <MetricCard label="Pending invitations" formattedValue={String(metrics.pendingInvitations)} />
          <MetricCard label="Expired invitations" formattedValue={String(metrics.expiredInvitations)} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Search actor, company, reason…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="w-full sm:w-56">
          <EnumSelect
            value={action}
            onValueChange={setAction}
            placeholder="All actions"
            options={[{ value: '', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: a.replace(/_/g, ' ') }))]}
          />
        </div>
      </div>

      <SectionCard bodyClassName="p-0">
        {!events && !error ? (
          <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading audit events…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                  <th className="hidden px-4 py-2.5 font-medium text-muted-foreground md:table-cell">Target</th>
                  <th className="hidden px-4 py-2.5 font-medium text-muted-foreground lg:table-cell">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{new Date(e.occurredAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.actorEmail ?? e.actorId.slice(0, 8)}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/superuser/clients/${e.companyId}`} className="text-muted-foreground hover:underline">
                        {e.companyName ?? e.companyId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{e.action.replace(/_/g, ' ')}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{e.recordType}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">{e.reason ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No events match.
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
