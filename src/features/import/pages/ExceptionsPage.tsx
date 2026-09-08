import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { EnumSelect } from '@/components/app/combobox';
import { HelpLink } from '@/features/help/components/HelpLink';
import { listOpenIssues, resolveIssue } from '../migration/importBatchService';
import { downloadExceptionReport } from '../migration/reports';
import type { ImportBatchIssue } from '../migration/types';

type OpenIssue = ImportBatchIssue & { batchFileName: string; batchImportType: string };

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'warning', label: 'Warnings' },
  { value: 'DUPLICATE', label: 'Duplicates' },
];

export function ExceptionsPage() {
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState('all');

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setIssues(await listOpenIssues());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exceptions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleResolve(issue: OpenIssue, status: 'resolved' | 'ignored') {
    try {
      await resolveIssue(issue.id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update this issue.');
    }
  }

  const filtered = issues.filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'DUPLICATE') return i.category === 'DUPLICATE';
    return i.severity === filter;
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Exceptions"
        description="Every unresolved issue across every import batch. Resolving one here does not require re-uploading the file — open the batch to remap and revalidate if needed."
        actions={
          <>
            <HelpLink article="import-exceptions" className="mr-1" />
            <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={() => downloadExceptionReport('open-issues', filtered)}>
              <Download className="mr-1.5 size-3.5" aria-hidden="true" /> Download exception report
            </Button>
            <Button variant="outline" size="sm" render={<Link to="/admin/imports" />}>
              Back to overview
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <EnumSelect value={filter} onValueChange={setFilter} options={FILTERS} className="w-48" />
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <SectionCard bodyClassName="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No open exceptions.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map((issue) => (
              <div key={issue.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                {/* min-w-0 + break-words — an unusually long source filename or issue message (both come from an arbitrary uploaded file) must wrap inside this row rather than forcing page-level horizontal overflow. */}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className={issue.severity === 'error' ? 'font-medium text-status-negative' : 'font-medium text-status-warning'}>{issue.severity.toUpperCase()}</span>
                    <Link to={`/admin/imports/history/${issue.batchId}`} className="break-words text-brand hover:underline">
                      {issue.batchFileName}
                    </Link>
                    {issue.rowNumber && <span className="text-muted-foreground">· Row {issue.rowNumber}</span>}
                  </span>
                  <span className="text-sm break-words text-muted-foreground">{issue.message}</span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => void handleResolve(issue, 'resolved')}>
                    Mark resolved
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleResolve(issue, 'ignored')}>
                    Ignore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
