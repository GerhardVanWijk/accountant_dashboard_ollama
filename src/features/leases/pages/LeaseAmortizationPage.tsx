import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useLeaseAmortization } from '../hooks/useLeaseAmortization';
import { useLeases } from '../hooks/useLeases';
import { RunAmortizationForm } from '../components/RunAmortizationForm';
import { AmortizationHistoryTable } from '../components/AmortizationHistoryTable';
import { Modal } from '../components/Modal';

function endOfCurrentMonth(): string {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

/** Lease Amortization — route `/leases/amortization`. Mirrors src/features/assets/pages/DepreciationPage.tsx. */
export function LeaseAmortizationPage() {
  const { history, loading, error, refetch, runAmortization } = useLeaseAmortization();
  const { leases, loading: leasesLoading } = useLeases();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);

  const activeCount = leases.filter((l) => l.status === 'active').length;
  const busy = loading || leasesLoading;

  const handleRun = async (periodEnd: string) => {
    setActionError(null);
    setLastRunMessage(null);
    try {
      const result = await runAmortization(periodEnd);
      setLastRunMessage(
        result.entries.length === 0
          ? `Nothing due for ${periodEnd} — every active lease was already amortized for this period, or none are eligible.`
          : `Posted amortization for ${result.entries.length} lease${result.entries.length === 1 ? '' : 's'} for the period ending ${periodEnd}.`,
      );
      setRunDialogOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to run amortization.');
    }
  };

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Lease Amortization</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Run periodic lease interest/principal amortization and Right-of-Use depreciation. /leases/amortization
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <span className="text-sm text-text-secondary">{activeCount} active lease{activeCount === 1 ? '' : 's'}</span>
          <Button onClick={() => setRunDialogOpen(true)} disabled={busy}>
            Run Amortization
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

      {busy && <Spinner label="Loading lease amortization history…" />}
      {!busy && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!busy && !error && (
        <Card>
          {history.length === 0 ? (
            <EmptyState
              title="No lease amortization posted yet"
              message="Run amortization once a lease has commenced on the Lease Register."
            />
          ) : (
            <AmortizationHistoryTable entries={history} leases={leases} />
          )}
        </Card>
      )}

      {runDialogOpen && (
        <Modal title="Run Amortization" onClose={() => setRunDialogOpen(false)}>
          <RunAmortizationForm defaultPeriodEnd={endOfCurrentMonth()} onSubmit={handleRun} onCancel={() => setRunDialogOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
