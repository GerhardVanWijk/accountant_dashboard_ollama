import { useState } from 'react';
import type { AuditLogAccessEntry, Profile } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/app/format';

export interface AccessLogTableProps {
  entries: AuditLogAccessEntry[];
  profilesById: Map<string, Profile>;
}

function displayName(actorId: string | undefined, profilesById: Map<string, Profile>): string {
  if (!actorId) return 'Unknown';
  const profile = profilesById.get(actorId);
  if (!profile) return actorId;
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || actorId;
}

const RESULT_META: Record<string, { label: string; className: string }> = {
  allowed: { label: 'Allowed', className: 'bg-status-positive-muted text-status-positive' },
  denied_permission: { label: 'Permission denied', className: 'bg-status-negative-muted text-status-negative' },
  denied_rls: { label: 'Blocked by policy', className: 'bg-status-warning-muted text-status-warning' },
};

const ACTION_LABELS: Record<string, string> = {
  view: 'Opened area',
  access_denied: 'Access denied',
  suspended_access_attempt: 'Suspended-workspace attempt',
};

function reasonFor(e: AuditLogAccessEntry): string {
  if (e.result === 'denied_permission') {
    const feature = typeof e.detail?.feature === 'string' ? e.detail.feature : undefined;
    return feature ? `Missing permission: ${feature}` : 'Missing permission';
  }
  if (e.result === 'denied_rls') return 'Blocked by a database security policy';
  return '—';
}

/**
 * Access checkpoints (`audit_logs_access`) — WHO tried to reach a protected
 * area and whether it was allowed or denied. A different log from the
 * business Audit Trail; not conflated with it.
 */
export function AccessLogTable({ entries, profilesById }: AccessLogTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const areas = [...new Set(entries.map((e) => e.tableName))].sort();

  const columns: DataTableColumn<AuditLogAccessEntry>[] = [
    {
      key: 'when',
      header: 'Time',
      sortValue: (e) => e.occurredAt,
      cell: (e) => <span className="figure tabular-nums text-muted-foreground">{formatDateTime(e.occurredAt)}</span>,
    },
    {
      key: 'user',
      header: 'User',
      sortValue: (e) => displayName(e.actorId, profilesById),
      cell: (e) => <span className="font-medium text-foreground">{displayName(e.actorId, profilesById)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      hideBelowMd: true,
      sortValue: (e) => e.action,
      cell: (e) => ACTION_LABELS[e.action] ?? e.action,
    },
    {
      key: 'area',
      header: 'Area / resource',
      sortValue: (e) => e.tableName,
      cell: (e) => <span className="text-foreground">{e.tableName}</span>,
    },
    {
      key: 'result',
      header: 'Result',
      sortValue: (e) => e.result,
      cell: (e) => {
        const meta = RESULT_META[e.result] ?? { label: e.result, className: 'bg-muted text-muted-foreground' };
        return (
          <Badge variant="outline" className={cn('border-transparent', meta.className)}>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'reason',
      header: 'Reason',
      hideBelowLg: true,
      cell: (e) => <span className="text-xs text-muted-foreground">{reasonFor(e)}</span>,
    },
  ];

  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowKey={(e) => e.id}
      searchable={(e) => [displayName(e.actorId, profilesById), e.action, e.tableName, e.result].join(' ')}
      searchPlaceholder="Search by user, area or result"
      initialSortKey="when"
      initialSortDirection="desc"
      filters={[
        {
          key: 'area',
          label: 'All areas',
          options: areas.map((t) => ({ value: t, label: t })),
          match: (e, value) => e.tableName === value,
        },
        {
          key: 'result',
          label: 'All results',
          options: [
            { value: 'allowed', label: 'Allowed' },
            { value: 'denied', label: 'Denied (any)' },
            { value: 'denied_permission', label: 'Permission denied' },
            { value: 'denied_rls', label: 'Blocked by policy' },
          ],
          match: (e, value) => (value === 'denied' ? e.result.startsWith('denied') : e.result === value),
        },
      ]}
      emptyTitle="No access events yet"
      emptyDescription="Denied permission attempts and entries into sensitive areas will appear here."
      onRowClick={(e) => (e.detail && Object.keys(e.detail).length > 0 ? setOpenId((c) => (c === e.id ? null : e.id)) : undefined)}
      getRowAriaLabel={(e) => `${e.action} on ${e.tableName} — ${e.result}`}
      renderDetail={(e) =>
        e.id === openId && e.detail ? (
          <div className="px-4 pb-4">
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {JSON.stringify(e.detail, null, 2)}
            </pre>
          </div>
        ) : null
      }
    />
  );
}
