import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { AuditLogEntry } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { HistoryIcon, RotateCcwIcon, ShieldIcon, WalletCardsIcon } from 'lucide-react';
import { StatTileGrid } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { EnumSelect } from '@/components/app/combobox';
import { DataTable, type DataTableColumn } from '@/components/app/data-table';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/app/format';
import { useAuthStore } from '@/stores/authStore';
import { useLogSensitiveAccess } from '@/features/auth/hooks/useLogSensitiveAccess';
import { auditLogService } from '@/services/auditLogService';
import {
  AUDIT_MODULES,
  auditActionLabel,
  auditActorName,
  auditModuleLabel,
  describeAuditEntry,
  resolveAuditRecordLink,
} from '../utils/auditLabels';
import { useAuditTrailPage, AUDIT_PAGE_SIZE, type AuditTrailFilters } from '../hooks/useAuditTrailPage';

const QUICK_FILTERS: { label: string; build: () => AuditTrailFilters }[] = [
  { label: 'Today', build: () => ({ from: startOfToday() }) },
  { label: '7 days', build: () => ({ from: daysAgo(7) }) },
  { label: '30 days', build: () => ({ from: daysAgo(30) }) },
  { label: 'Security & admin', build: () => ({ module: 'admin', from: daysAgo(90) }) },
];

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export function AuditTrailPage() {
  const companyId = useAuthStore((s) => s.profile?.companyId);
  useLogSensitiveAccess('Audit trail');
  const {
    entries,
    total,
    page,
    pageCount,
    setPage,
    filters,
    setFilters,
    profilesById,
    loading,
    error,
    refetch,
  } = useAuditTrailPage(companyId);

  const [kpis, setKpis] = useState<{ events: number; financialPostings: number; securityAdmin: number; reversals: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    auditLogService
      .getKpis()
      .then((k) => {
        if (!cancelled) setKpis(k);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const userOptions = useMemo(
    () => [
      { value: '', label: 'All users' },
      ...[...profilesById.values()].map((p) => ({
        value: p.id,
        label: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || p.id,
      })),
    ],
    [profilesById],
  );

  function patch(next: Partial<AuditTrailFilters>) {
    setFilters({ ...filters, ...next });
  }

  const columns: DataTableColumn<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Date & time',
      cell: (e) => <span className="figure tabular-nums text-muted-foreground">{formatDateTime(e.createdAt)}</span>,
    },
    {
      key: 'user',
      header: 'User',
      cell: (e) => <span className="font-medium text-foreground">{auditActorName(e.userId, profilesById)}</span>,
    },
    {
      key: 'module',
      header: 'Module',
      hideBelowMd: true,
      cell: (e) => <span>{auditModuleLabel(e.module)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      cell: (e) => (
        <div className="flex flex-col">
          <span>{auditActionLabel(e.action)}</span>
          <span className="text-xs text-muted-foreground">{describeAuditEntry(e)}</span>
        </div>
      ),
    },
    {
      key: 'record',
      header: 'Record',
      hideBelowLg: true,
      cell: (e) => {
        const href = resolveAuditRecordLink(e.recordType, e.recordId);
        const label = `${e.recordType}`;
        return href ? (
          <Link to={href} className="figure text-xs text-primary hover:underline">
            {label}
          </Link>
        ) : (
          <span className="figure text-xs text-muted-foreground">{label}</span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit trail"
        description="A complete history of important changes and accounting actions in your Vertex workspace — who changed, posted or updated what."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/admin/audit" />}>
            View access log
          </Button>
        }
      />

      <StatTileGrid
        columns={4}
        metrics={[
          { label: 'Events (30 days)', value: kpis ? String(kpis.events) : '—', hint: 'All logged changes', icon: HistoryIcon },
          { label: 'Financial postings', value: kpis ? String(kpis.financialPostings) : '—', hint: 'Last 30 days', icon: WalletCardsIcon },
          { label: 'Security & admin', value: kpis ? String(kpis.securityAdmin) : '—', hint: 'Users, roles, company', icon: ShieldIcon },
          { label: 'Reversals & corrections', value: kpis ? String(kpis.reversals) : '—', hint: 'Last 30 days', icon: RotateCcwIcon },
        ]}
      />

      <SectionCard title="Events" bodyClassName="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_FILTERS.map((q) => (
            <Button key={q.label} variant="outline" size="sm" onClick={() => setFilters(q.build())}>
              {q.label}
            </Button>
          ))}
          {Object.keys(filters).length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              Clear filters
            </Button>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              patch({ search: searchDraft.trim() || undefined });
            }}
          >
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search reason or record id"
              aria-label="Search the audit trail"
            />
          </form>
          <EnumSelect
            aria-label="Module"
            value={filters.module ?? ''}
            onValueChange={(v) => patch({ module: v || undefined })}
            options={[{ value: '', label: 'All modules' }, ...AUDIT_MODULES.map((m) => ({ value: m, label: auditModuleLabel(m) }))]}
          />
          <EnumSelect
            aria-label="User"
            value={filters.userId ?? ''}
            onValueChange={(v) => patch({ userId: v || undefined })}
            options={userOptions}
          />
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From date"
              value={filters.from?.slice(0, 10) ?? ''}
              onChange={(e) => patch({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            />
            <Input
              type="date"
              aria-label="To date"
              value={filters.to?.slice(0, 10) ?? ''}
              onChange={(e) => patch({ to: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : undefined })}
            />
          </div>
        </div>

        {loading ? (
          <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p className="text-sm">Loading audit trail…</p>
          </div>
        ) : error ? (
          <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error.message}</span>
            <Button variant="outline" size="sm" onClick={refetch}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <DataTable
              rows={entries}
              columns={columns}
              getRowKey={(e) => e.id}
              pageSize={AUDIT_PAGE_SIZE}
              emptyTitle="No matching events"
              emptyDescription="Adjust the filters, or widen the date range."
              onRowClick={(e) => setOpenId((current) => (current === e.id ? null : e.id))}
              getRowAriaLabel={(e) => `${auditActionLabel(e.action)} — show details`}
              renderDetail={(e) => (e.id === openId ? <AuditEventDetail entry={e} name={auditActorName(e.userId, profilesById)} /> : null)}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {total === 0
                  ? 'No events'
                  : `Showing ${page * AUDIT_PAGE_SIZE + 1}–${Math.min((page + 1) * AUDIT_PAGE_SIZE, total)} of ${total}`}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="figure">
                    Page {page + 1} of {pageCount}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

function AuditEventDetail({ entry, name }: { entry: AuditLogEntry; name: string }) {
  const href = resolveAuditRecordLink(entry.recordType, entry.recordId);
  return (
    <div className="flex flex-col gap-3 px-4 py-4 text-sm">
      <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <Row label="Actor" value={name} />
        <Row label="When" value={formatDateTime(entry.createdAt)} />
        <Row label="Module" value={auditModuleLabel(entry.module)} />
        <Row label="Action" value={auditActionLabel(entry.action)} />
        <Row label="Record type" value={entry.recordType} />
        <Row
          label="Record reference"
          value={
            href ? (
              <Link to={href} className="text-primary hover:underline">
                {entry.recordId}
              </Link>
            ) : (
              <span className="figure text-xs">{entry.recordId}</span>
            )
          }
        />
        {entry.reason && <Row label="Reason" value={entry.reason} />}
      </dl>
      {(entry.previousValue != null || entry.newValue != null) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <BeforeAfter label="Before" value={entry.previousValue} />
          <BeforeAfter label="After" value={entry.newValue} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1 sm:border-none">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right text-foreground')}>{value}</dd>
    </div>
  );
}

function BeforeAfter({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
        {value === undefined || value === null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
