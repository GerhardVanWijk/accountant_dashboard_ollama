import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useDepreciation } from '../hooks/useDepreciation';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { RunDepreciationForm } from '../components/RunDepreciationForm';
import { DepreciationHistoryTable } from '../components/DepreciationHistoryTable';
import { Modal } from '../components/Modal';

function endOfCurrentMonth(): string {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

/** Depreciation — route `/assets/depreciation` (docs/ROUTES.md). */
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
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Depreciation</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Run periodic depreciation and review the posting history. /assets/depreciation
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <span className="text-sm text-text-secondary">{activeCount} active asset{activeCount === 1 ? '' : 's'}</span>
          <Button onClick={() => setRunDialogOpen(true)} disabled={busy}>
            Run Depreciation
          </Button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}
      {lastRunMessage && (
        <p role="status" className="rounded-md border border-border bg-positive/10 px-md py-sm text-sm text-positive">
          {lastRunMessage}
        </p>
      )}

      {busy && <Spinner label="Loading depreciation history…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <Card>
          {history.length === 0 ? (
            <EmptyState
              title="No depreciation posted yet"
              message="Run depreciation once an asset has been capitalized on the Asset Register."
            />
          ) : (
            <DepreciationHistoryTable entries={history} assets={assets} />
          )}
        </Card>
      )}

      {runDialogOpen && (
        <Modal title="Run Depreciation" onClose={() => setRunDialogOpen(false)}>
          <RunDepreciationForm defaultPeriodEnd={endOfCurrentMonth()} onSubmit={handleRun} onCancel={() => setRunDialogOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
