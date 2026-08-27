import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AuditLogEntry } from '@/types';
import { auditLogService } from '@/services/auditLogService';
import { formatDateTime } from '@/lib/app/format';
import { RecordDetailSection } from '@/components/app/record-detail-sheet';

const ACTION_LABEL: Partial<Record<AuditLogEntry['action'], string>> = {
  created: 'Created',
  edited: 'Edited',
  posted: 'Posted',
  approved: 'Approved',
  reversed: 'Reversed',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
  bank_reconciled: 'Reconciled',
};

/**
 * Shared audit-history section for any record-detail sheet — "when / who /
 * action / reason" per the audit rule. Generic over recordType/recordId
 * (the same shared AuditLogService every module already writes to), so
 * every future detail sheet gets this for free instead of a bespoke fetch.
 *
 * Known, honest limitation (not fixed here): AuditLogEntry.userId is a
 * free-text actor id, not a real FK to `profiles` — this app has no
 * resolved-username lookup for it yet (see AuditLogEntry's own doc
 * comment), so the actor is shown as its raw stored value rather than a
 * fabricated display name.
 */
export function RecordAuditHistorySection({ recordType, recordId }: { recordType: string; recordId: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    auditLogService
      .getForRecord(recordType, recordId)
      .then((data) => {
        if (!cancelled) setEntries([...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load audit history.');
      });
    return () => {
      cancelled = true;
    };
  }, [recordType, recordId]);

  if (error) {
    return (
      <RecordDetailSection title="Audit history">
        <p className="text-xs text-status-negative">{error}</p>
      </RecordDetailSection>
    );
  }

  if (entries === null) {
    return (
      <RecordDetailSection title="Audit history">
        <div role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      </RecordDetailSection>
    );
  }

  if (entries.length === 0) {
    return (
      <RecordDetailSection title="Audit history">
        <p className="text-xs text-muted-foreground">No audit entries recorded for this record yet.</p>
      </RecordDetailSection>
    );
  }

  return (
    <RecordDetailSection title="Audit history">
      <ol className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">By {entry.userId}</p>
            {entry.reason ? <p className="mt-1 text-xs text-foreground">{entry.reason}</p> : null}
          </li>
        ))}
      </ol>
    </RecordDetailSection>
  );
}
