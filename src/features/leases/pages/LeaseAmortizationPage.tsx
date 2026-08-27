import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { Button } from '@/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/shadcn/dialog';
import { useLeaseAmortization } from '../hooks/useLeaseAmortization';
import { useLeases } from '../hooks/useLeases';
import { RunAmortizationForm } from '../components/RunAmortizationForm';
import { AmortizationHistoryTable } from '../components/AmortizationHistoryTable';

function endOfCurrentMonth(): string {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

/**
 * Lease Amortization — route `/leases/amortization`. Real
 * useLeaseAmortization()/leaseAmortizationService data; the run action
 * posts one combined journal entry via the existing service, mirroring
 * DepreciationPage. Re-skinned onto v0's
 * PageHeader/SectionCard/DataTable/Dialog (M13).
 */
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lease amortization"
        description="Run periodic lease interest/principal amortization and Right-of-Use depreciation."
        actions={
          <Button size="sm" disabled={busy} onClick={() => setRunDialogOpen(true)}>
            <Play data-icon="inline-start" />
            Run amortization
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
          <span className="font-medium text-foreground">{activeCount}</span> active lease{activeCount === 1 ? '' : 's'} eligible for amortization.
        </p>
      </SectionCard>

      {busy && (
        <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading lease amortization history…</p>
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
        <SectionCard title="Posting history" description="Every lease amortization charge posted so far, most recent first.">
          <AmortizationHistoryTable entries={history} leases={leases} />
        </SectionCard>
      )}

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Run Amortization</DialogTitle>
          </DialogHeader>
          <RunAmortizationForm defaultPeriodEnd={endOfCurrentMonth()} onSubmit={handleRun} onCancel={() => setRunDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
