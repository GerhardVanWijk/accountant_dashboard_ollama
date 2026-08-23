import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/authStore';
import type { AuditLogAccessEntry } from '@/types';
import { auditLogAccessService } from '@/features/auth/services';

/**
 * Real content for the access-audit log (Phase T's `audit_logs_access`
 * table) — replaces the old placeholder. Deliberately scoped to THIS log
 * only: the older, separate `AuditLogEntry` business audit trail
 * (src/services/auditLogService.ts — who changed a posted document's
 * fields) has its own pre-existing "no UI yet" gap, tracked in
 * docs/KNOWN_ISSUES.md, not attempted here. See src/types/accessAudit.ts
 * for why this log is best-effort, not a complete record of every access.
 */
export function AuditPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  const [entries, setEntries] = useState<AuditLogAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    auditLogAccessService
      .getByCompany(companyId)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [companyId]);

  if (!companyId) return null;

  return (
    <div className="flex flex-col gap-lg">
      <h1 className="text-xl font-semibold text-text-primary">System Audit Trail</h1>
      <Card>
        <h2 className="text-base font-semibold text-text-primary">Access log</h2>
        <p className="mt-xs text-sm text-text-secondary">
          Best-effort record of access checkpoints logged by the app, not a complete interception of every query — see
          docs/SUPABASE_MIGRATION_GUIDE.md's Phase T section.
        </p>
        {loading ? (
          <p className="mt-md text-sm text-text-secondary">Loading…</p>
        ) : (
          <div className="mt-md overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="py-xs pr-md font-medium">When</th>
                  <th className="py-xs pr-md font-medium">Action</th>
                  <th className="py-xs pr-md font-medium">Table</th>
                  <th className="py-xs pr-md font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="py-sm pr-md text-text-secondary">{new Date(entry.occurredAt).toLocaleString()}</td>
                    <td className="py-sm pr-md text-text-primary">{entry.action}</td>
                    <td className="py-sm pr-md text-text-primary">{entry.tableName}</td>
                    <td className="py-sm pr-md">
                      <span className={entry.result === 'allowed' ? 'text-positive' : 'text-danger'}>{entry.result}</span>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-md text-center text-text-secondary">
                      No access log entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
