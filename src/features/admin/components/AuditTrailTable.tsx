import { useNavigate } from 'react-router-dom';
import type { AuditLogEntry, Profile } from '@/types';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { RecordLink } from '@/components/app/record-link';
import { formatDateTime } from '@/lib/app/format';

export interface AuditTrailTableProps {
  entries: AuditLogEntry[];
  profilesById: Map<string, Profile>;
}

/**
 * `AuditLogEntry.recordType`/`recordId` are free `text` columns, not
 * database-enforced FKs (SupabaseAuditLogRepository's doc comment) — never
 * assume a record type resolves to a real route. This maps only the
 * `recordType` strings that (a) are actually written by
 * `auditLogService.log()` calls in this codebase today (grepped, not
 * guessed) AND (b) have a genuine `?record=`-deep-linkable detail view to
 * send them to. Every other recordType (Company, TaxRate, Profile, Role,
 * UserRoleAssignment, FinancialYear, AccountingPeriod, BankReconciliation,
 * ReconciliationIssue, ReportingStandardVersion, PublicInterestScore) has
 * no such view yet, so those rows correctly stay plain text below rather
 * than link to something that doesn't exist.
 */
const RECORD_TYPE_ROUTES: Record<string, string> = {
  JournalEntry: '/accounting/journals',
};

function resolveRecordLink(recordType: string, recordId: string): string | null {
  const base = RECORD_TYPE_ROUTES[recordType];
  if (!base || !recordId) return null;
  return `${base}?record=${recordId}`;
}

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  edited: 'Edited',
  posted: 'Posted',
  approved: 'Approved',
  reversed: 'Reversed',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
  period_closed: 'Period closed',
  period_reopened: 'Period reopened',
  financial_year_closed: 'Financial year closed',
  reporting_framework_changed: 'Reporting framework changed',
  bank_reconciled: 'Bank reconciled',
  tax_return_prepared: 'Tax return prepared',
  tax_return_finalised: 'Tax return finalised',
  tax_rate_superseded: 'Tax rate superseded',
  permission_changed: 'Permission changed',
  public_interest_score_calculated: 'Public interest score calculated',
};

function displayName(userId: string, profilesById: Map<string, Profile>): string {
  const profile = profilesById.get(userId);
  if (!profile) return userId === 'system' ? 'System' : userId;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  return name || profile.email || userId;
}

/**
 * Every real change written to `AuditLogEntry` — no frontend-invented rows.
 * `reason` (mandatory on the highest-risk overrides, e.g.
 * CompanyService.setReportingFramework/setSbcEligibility) is shown as the
 * description when present; otherwise a plain summary of which fields
 * changed is derived from `previousValue`/`newValue`, never a fabricated
 * narrative. No IP/device columns — that data was never captured (see
 * `AuditLogEntry`'s own doc comment: this is a browser SPA with no
 * server-side session). Re-skinned onto v0's DataTable (M10), mirroring
 * `accounting-v0-frontend/components/app/admin/audit-trail-table.tsx`.
 */
export function AuditTrailTable({ entries, profilesById }: AuditTrailTableProps) {
  const navigate = useNavigate();
  const modules = [...new Set(entries.map((e) => e.module))].sort();
  const actions = [...new Set(entries.map((e) => e.action))].sort();

  function describe(entry: AuditLogEntry): string {
    if (entry.reason) return entry.reason;
    const changedKeys = entry.newValue && typeof entry.newValue === 'object' ? Object.keys(entry.newValue as object) : [];
    if (changedKeys.length > 0) return `Changed ${changedKeys.join(', ')}`;
    return `${entry.recordType} ${entry.recordId}`;
  }

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Date and time',
      sortValue: (e) => e.createdAt,
      cell: (e) => <span className="figure text-muted-foreground tabular-nums">{formatDateTime(e.createdAt)}</span>,
    },
    {
      key: 'user',
      header: 'User',
      sortValue: (e) => displayName(e.userId, profilesById),
      cell: (e) => <span className="font-medium text-foreground">{displayName(e.userId, profilesById)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      sortValue: (e) => e.action,
      cell: (e) => (
        <div className="flex flex-col">
          <span>{ACTION_LABELS[e.action] ?? e.action}</span>
          <span className="text-xs text-muted-foreground">{describe(e)}</span>
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Module',
      hideBelowMd: true,
      sortValue: (e) => e.module,
      cell: (e) => {
        const href = resolveRecordLink(e.recordType, e.recordId);
        return (
          <div className="flex flex-col">
            <span className="capitalize">{e.module}</span>
            {href ? (
              <RecordLink onClick={() => navigate(href)} className="figure text-xs">
                {e.recordType} {e.recordId}
              </RecordLink>
            ) : (
              <span className="figure text-xs text-muted-foreground">
                {e.recordType} {e.recordId}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowKey={(e) => e.id}
      searchable={(e) => [displayName(e.userId, profilesById), e.action, e.module, e.recordType, e.recordId, e.reason ?? ''].join(' ')}
      searchPlaceholder="Search by user, action or record"
      initialSortKey="timestamp"
      initialSortDirection="desc"
      filters={[
        {
          key: 'module',
          label: 'All modules',
          options: modules.map((m) => ({ value: m, label: m })),
          match: (e, value) => e.module === value,
        },
        {
          key: 'action',
          label: 'All actions',
          options: actions.map((a) => ({ value: a, label: ACTION_LABELS[a] ?? a })),
          match: (e, value) => e.action === value,
        },
      ]}
      emptyTitle="No audit events yet"
      emptyDescription="Changes made across the workspace will appear here."
    />
  );
}
