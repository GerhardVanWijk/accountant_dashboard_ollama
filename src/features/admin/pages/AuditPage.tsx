import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { useAuthStore } from '@/stores/authStore';
import type { AuditLogAccessEntry, Profile } from '@/types';
import { auditLogAccessService, profileService } from '@/features/auth/services';
import { AccessLogTable } from '../components/AccessLogTable';

/**
 * Real content for the access-audit log (Phase T's `audit_logs_access`
 * table). Deliberately scoped to THIS log only: the separate, newer
 * `AuditLogEntry` business audit trail (M10's `/admin/audit-trail`,
 * src/features/admin/pages/AuditTrailPage.tsx — who changed a posted
 * document's fields) is a different log entirely. See
 * src/types/accessAudit.ts for why this log is best-effort, not a complete
 * record of every access.
 *
 * `actorId` is now resolved to a real Profile (same pattern as
 * useAuditTrail.ts's profilesById) — the prior version of this page never
 * showed who the access checkpoint was for at all. Table swapped for the
 * shared DataTable (search/filter/sort, previously entirely absent here)
 * and each row expands to its raw `detail` payload (real captured context,
 * not fabricated) rather than gaining a fake record-detail link — an access
 * checkpoint isn't itself a financial record with relationships to trace.
 */
export function AuditPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const [entries, setEntries] = useState<AuditLogAccessEntry[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    Promise.all([auditLogAccessService.getByCompany(companyId), profileService.getByCompany(companyId)])
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

  if (!companyId) return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Access log" description="Best-effort record of access checkpoints logged by the app, not a complete interception of every query." />

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading access log…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={refetch}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <SectionCard>
          <AccessLogTable entries={entries} profilesById={profilesById} />
        </SectionCard>
      )}
    </div>
  );
}
