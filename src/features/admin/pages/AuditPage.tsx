import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { useAuthStore } from '@/stores/authStore';
import type { AuditLogAccessEntry } from '@/types';
import { auditLogAccessService } from '@/features/auth/services';

/**
 * Real content for the access-audit log (Phase T's `audit_logs_access`
 * table). Deliberately scoped to THIS log only: the separate, newer
 * `AuditLogEntry` business audit trail (M10's `/admin/audit-trail`,
 * src/features/admin/pages/AuditTrailPage.tsx — who changed a posted
 * document's fields) is a different log entirely. See
 * src/types/accessAudit.ts for why this log is best-effort, not a complete
 * record of every access. Re-skinned onto v0's PageHeader/SectionCard
 * (M14) — this page was missed by every earlier phase (M10 built the newer
 * AuditTrailPage.tsx alongside it but left this pre-existing page
 * untouched); same auditLogAccessService call, unchanged. Phase 6 fixed the
 * loading/error states themselves to match every other page's established
 * Loader2/role="status"/retry-button convention — this page never got that
 * pass and was still on a plain "Loading…" string with no error handling
 * at all (a rejected fetch left the table silently empty forever).
 */
export function AuditPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const [entries, setEntries] = useState<AuditLogAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    auditLogAccessService
      .getByCompany(companyId)
      .then(setEntries)
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
        <SectionCard bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">When</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Action</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Table</th>
                  <th className="px-4 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">Result</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</td>
                    <td className="px-4 py-2">{entry.action}</td>
                    <td className="px-4 py-2">{entry.tableName}</td>
                    <td className="px-4 py-2">
                      <span className={entry.result === 'allowed' ? 'text-status-positive' : 'text-status-negative'}>{entry.result}</span>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                      No access log entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
