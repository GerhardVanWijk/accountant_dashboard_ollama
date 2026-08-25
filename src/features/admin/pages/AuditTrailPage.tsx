import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { useAuthStore } from '@/stores/authStore';
import { useAuditTrail } from '../hooks/useAuditTrail';
import { AuditTrailTable } from '../components/AuditTrailTable';

/**
 * Business Audit Trail — route `/admin/audit-trail`. Real
 * `auditLogService.getAll()` data: every real change written by
 * Accounting/Sales/Purchases/Banking/Tax/Compliance/Admin services
 * (SA_ACCOUNTING_MASTER_SPEC.md §37) — not a second, frontend-invented
 * audit mechanism. This is a DIFFERENT audit domain from the existing
 * `/admin/audit` access log (`audit_logs_access` — allowed/denied access
 * checkpoints): that page is untouched, linked from here rather than
 * merged, since the two logs record genuinely different things. Re-skinned
 * onto v0's PageHeader/SectionCard/FigureBlock/DataTable (M10).
 */
export function AuditTrailPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const { entries, profilesById, loading, error, refetch } = useAuditTrail(companyId);

  const uniqueUsers = new Set(entries.map((e) => e.userId)).size;
  const modules = new Set(entries.map((e) => e.module)).size;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit trail"
        description="A record of who changed what across the workspace, kept for as long as the account is active."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/admin/audit" />}>
            View access log
          </Button>
        }
      />

      {loading && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading audit trail…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <>
          <SectionCard>
            <div className="grid gap-6 sm:grid-cols-3">
              <FigureBlock label="Events logged" value={String(entries.length)} hint="In the current view" />
              <FigureBlock label="Users involved" value={String(uniqueUsers)} hint="Made a change" />
              <FigureBlock label="Modules touched" value={String(modules)} hint="Across the workspace" />
            </div>
          </SectionCard>

          <AuditTrailTable entries={entries} profilesById={profilesById} />
        </>
      )}
    </div>
  );
}
