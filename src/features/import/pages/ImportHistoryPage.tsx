import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { listBatches, cancelBatch } from '../migration/importBatchService';
import type { ImportBatch } from '../migration/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const CANCELLABLE_STATUSES = new Set(['uploaded', 'mapping', 'validation_failed', 'ready']);

export function ImportHistoryPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setBatches(await listBatches());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCancel(batch: ImportBatch) {
    try {
      await cancelBatch(batch.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel this batch.');
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Import History"
        description="Every import attempt, with its status, source and results — clicking a batch shows the full mapping, validation and reconciliation detail."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/admin/imports" />}>
            Back to overview
          </Button>
        }
      />

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <SectionCard bodyClassName="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </div>
        ) : batches.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No imports yet — start one from the overview page.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">File</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Import Type</th>
                  <th className="px-4 py-2.5">Rows</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(b.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/imports/history/${b.id}`} className="font-medium text-brand hover:underline">
                        {b.fileName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{b.sourceSystem}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{b.importType}</td>
                    <td className="px-4 py-2.5 tabular-nums">{b.rowCount || '—'}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {CANCELLABLE_STATUSES.has(b.status) && (
                        <Button variant="ghost" size="sm" onClick={() => void handleCancel(b)}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
