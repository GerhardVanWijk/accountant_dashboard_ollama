import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useAuthStore } from '@/stores/authStore';
import { useLogSensitiveAccess } from '@/features/auth/hooks/useLogSensitiveAccess';
import type { AuditLogAccessEntry, Profile } from '@/types';
import { auditLogAccessService, profileService } from '@/features/auth/services';
import { AccessLogTable } from '../components/AccessLogTable';

/**
 * Access Log — route `/admin/audit`. Reads `audit_logs_access`: WHO tried
 * to reach a protected area and whether it was allowed or denied. A
 * different, deliberately separate log from the business Audit Trail
 * (`/admin/audit-trail`, `audit_log_entries` — who *changed* a record).
 *
 * Rows are written by `log_access_event` (migration 0072): a
 * `denied_permission` row from every blocked `<PermissionRoute>`, and an
 * `allowed` row when a user enters a security-sensitive area
 * (`useLogSensitiveAccess`). De-duplicated server-side.
 */
const WINDOW_DAYS = 7;

export function AuditPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  useLogSensitiveAccess('Access log');

  const [entries, setEntries] = useState<AuditLogAccessEntry[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      auditLogAccessService.getByCompany(companyId, 500),
      profileService.getByCompany(companyId),
    ])
      .then(([accessEntries, profiles]) => {
        setEntries(accessEntries);
        setProfilesById(new Map(profiles.map((p) => [p.id, p])));
      })
      .catch((err) => setError(err instanceof Error ? err : new Error('Failed to load the access log.')))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const kpis = useMemo(() => {
    const since = Date.now() - WINDOW_DAYS * 86_400_000;
    const recent = entries.filter((e) => new Date(e.occurredAt).getTime() >= since);
    return {
      denied: recent.filter((e) => e.result.startsWith('denied')).length,
      permissionDenied: recent.filter((e) => e.result === 'denied_permission').length,
      sensitiveAccess: recent.filter((e) => e.result === 'allowed').length,
      users: new Set(recent.map((e) => e.actorId).filter(Boolean)).size,
    };
  }, [entries]);

  if (!companyId) return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Access log"
        description="Review security-sensitive access and denied permission attempts across your workspace."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/admin/audit-trail" />}>
            View audit trail
          </Button>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Denied attempts" value={String(kpis.denied)} hint={`Last ${WINDOW_DAYS} days`} />
          <FigureBlock label="Permission denials" value={String(kpis.permissionDenied)} hint="Blocked by role/permission" />
          <FigureBlock label="Sensitive-area access" value={String(kpis.sensitiveAccess)} hint={`Last ${WINDOW_DAYS} days`} />
          <FigureBlock label="Active users" value={String(kpis.users)} hint="Seen in the log" />
        </div>
      </SectionCard>

      {loading ? (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading access log…</p>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={refetch}>
            Retry
          </Button>
        </div>
      ) : (
        <SectionCard title="Access events" bodyClassName="p-4 sm:p-5">
          <AccessLogTable entries={entries} profilesById={profilesById} />
        </SectionCard>
      )}
    </div>
  );
}
