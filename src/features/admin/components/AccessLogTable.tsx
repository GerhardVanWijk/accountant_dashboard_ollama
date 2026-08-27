import { useState } from 'react';
import type { AuditLogAccessEntry, Profile } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { formatDateTime } from '@/lib/app/format';

export interface AccessLogTableProps {
  entries: AuditLogAccessEntry[];
  /** actorId -> a real Profile, same resolution pattern as AuditTrailPage's profilesById — falls back to the raw id when unresolved, never a fabricated name. */
  profilesById: Map<string, Profile>;
}

function displayName(actorId: string | undefined, profilesById: Map<string, Profile>): string {
  if (!actorId) return 'Unknown';
  const profile = profilesById.get(actorId);
  if (!profile) return actorId;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  return name || profile.email || actorId;
}

/**
 * Access checkpoints, re-skinned onto the shared DataTable (search/filter/
 * sort, entirely absent before this pass) — mirrors AuditTrailTable's shape
 * for consistency between the two "who did what" pages, while keeping this
 * log's real, distinct fields (result, tableName, detail) rather than
 * conflating it with the business Audit Trail.
 */
export function AccessLogTable({ entries, profilesById }: AccessLogTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const tables = [...new Set(entries.map((e) => e.tableName))].sort();

  const columns: DataTableColumn<AuditLogAccessEntry>[] = [
    {
      key: 'when',
      header: 'When',
      sortValue: (e) => e.occurredAt,
      cell: (e) => <span className="figure text-muted-foreground tabular-nums">{formatDateTime(e.occurredAt)}</span>,
    },
    {
      key: 'user',
      header: 'User',
      sortValue: (e) => displayName(e.actorId, profilesById),
      cell: (e) => <span className="font-medium text-foreground">{displayName(e.actorId, profilesById)}</span>,
    },
    { key: 'action', header: 'Action', sortValue: (e) => e.action, cell: (e) => e.action },
    { key: 'table', header: 'Table', hideBelowMd: true, sortValue: (e) => e.tableName, cell: (e) => <span className="figure text-xs text-muted-foreground">{e.tableName}</span> },
    {
      key: 'result',
      header: 'Result',
      sortValue: (e) => e.result,
      cell: (e) => <span className={e.result === 'allowed' ? 'text-status-positive' : 'text-status-negative'}>{e.result}</span>,
    },
  ];

  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowKey={(e) => e.id}
      searchable={(e) => [displayName(e.actorId, profilesById), e.action, e.tableName].join(' ')}
      searchPlaceholder="Search by user, action or table"
      initialSortKey="when"
      initialSortDirection="desc"
      filters={[
        {
          key: 'table',
          label: 'All tables',
          options: tables.map((t) => ({ value: t, label: t })),
          match: (e, value) => e.tableName === value,
        },
        {
          key: 'result',
          label: 'All results',
          options: [
            { value: 'allowed', label: 'Allowed' },
            { value: 'denied', label: 'Denied' },
          ],
          match: (e, value) => e.result === value,
        },
      ]}
      emptyTitle="No access log entries yet"
      emptyDescription="Access checkpoints logged by the app will appear here."
      onRowClick={(e) => (e.detail && Object.keys(e.detail).length > 0 ? setOpenId((current) => (current === e.id ? null : e.id)) : undefined)}
      getRowAriaLabel={(e) => (e.detail && Object.keys(e.detail).length > 0 ? `Show captured detail for this ${e.action} on ${e.tableName}` : `${e.action} on ${e.tableName}, no further detail captured`)}
      renderDetail={(e) =>
        e.id === openId && e.detail ? (
          <div className="px-4 pb-4">
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">{JSON.stringify(e.detail, null, 2)}</pre>
          </div>
        ) : null
      }
    />
  );
}
