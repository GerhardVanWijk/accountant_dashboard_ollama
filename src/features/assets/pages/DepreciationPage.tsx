import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { useDepreciation } from '../hooks/useDepreciation';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { RunDepreciationForm } from '../components/RunDepreciationForm';
import { DepreciationHistoryTable } from '../components/DepreciationHistoryTable';

function endOfCurrentMonth(): string {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

/**
 * Depreciation — route `/assets/depreciation`. Real
 * useDepreciation()/depreciationService data; the run action posts one
 * combined journal entry via the existing service, no depreciation math
 * lives in this page. No literal v0 template exists for this report —
 * re-skinned onto v0's general PageHeader/SectionCard/Dialog language
 * (M8), same precedent as M3's General Ledger.
 */
export function DepreciationPage() {
  const { history, loading, error, refetch, runDepreciation } = useDepreciation();
  const { assets, loading: assetsLoading } = useFixedAssets();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);

  const activeCount = assets.filter((a) => a.status === 'active').length;
  const busy = loading || assetsLoading;

  const handleRun = async (periodEnd: string) => {
    setActionError(null);
    setLastRunMessage(null);
    try {
      const result = await runDepreciation(periodEnd);
      setLastRunMessage(
        result.entries.length === 0
          ? `Nothing due for ${periodEnd} — every active asset was already depreciated for this period, or none are eligible.`
          : `Posted depreciation for ${result.entries.length} asset${result.entries.length === 1 ? '' : 's'} for the period ending ${periodEnd}.`,
      );
      setRunDialogOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to run depreciation.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Depreciation"
        description="Run periodic depreciation and review the posting history."
        actions={
          <Button size="sm" disabled={busy} onClick={() => setRunDialogOpen(true)}>
            <Play data-icon="inline-start" />
            Run depreciation
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {lastRunMessage && (
        <p role="status" className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-3 py-2 text-sm text-status-positive">
          {lastRunMessage}
        </p>
      )}

      <SectionCard>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{activeCount}</span> active asset{activeCount === 1 ? '' : 's'} eligible for depreciation.
        </p>
      </SectionCard>

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading depreciation history…</p>
        </div>
      )}
      {!busy && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!busy && !error && (
        <SectionCard title="Posting history" description="Every depreciation charge posted so far, most recent first.">
          <DepreciationHistoryTable entries={history} assets={assets} />
        </SectionCard>
      )}

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Run Depreciation</DialogTitle>
          </DialogHeader>
          <RunDepreciationForm defaultPeriodEnd={endOfCurrentMonth()} onSubmit={handleRun} onCancel={() => setRunDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
