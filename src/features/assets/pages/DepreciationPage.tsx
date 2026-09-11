import { useMemo, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { CalendarClockIcon, CoinsIcon, LayersIcon } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { StatTileGrid } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/shadcn/button';
import { FormShell, FormHeader } from '@/components/app/form';
import { formatCurrency } from '@/lib/app/format';
import { useDepreciation } from '../hooks/useDepreciation';
import { useFixedAssets } from '../hooks/useFixedAssets';
import { RunDepreciationForm } from '../components/RunDepreciationForm';
import { DepreciationHistoryTable } from '../components/DepreciationHistoryTable';
import { calculateMonthlyDepreciation } from '../services';

function endOfCurrentMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Depreciation — route `/assets/depreciation`. The run action previews and
 * then posts one combined journal entry via `depreciationService`; no
 * depreciation maths lives in this page.
 */
export function DepreciationPage() {
  const { history, loading, error, refetch, runDepreciation, previewDepreciation } = useDepreciation();
  const { assets, loading: assetsLoading } = useFixedAssets();
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const closeDialog = () => {
    setRunDialogOpen(false);
    setDirty(false);
  };
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);

  const busy = loading || assetsLoading;

  const activeAssets = assets.filter((a) => a.status === 'active');
  const nominalMonthlyCharge = useMemo(
    () => activeAssets.reduce((sum, a) => sum + calculateMonthlyDepreciation(a), 0),
    [activeAssets],
  );
  const currentMonthPrefix = endOfCurrentMonth().slice(0, 7);
  const postedThisMonth = history
    .filter((e) => e.periodEnd.slice(0, 7) === currentMonthPrefix)
    .reduce((sum, e) => sum + e.amount, 0);

  const handleRun = async (periodEnd: string) => {
    setActionError(null);
    setLastRunMessage(null);
    try {
      const result = await runDepreciation(periodEnd);
      const blockedNote =
        result.blockedPeriods.length > 0
          ? ` ${result.blockedPeriods.length} period${result.blockedPeriods.length === 1 ? '' : 's'} could not post (closed accounting period) — reopen and run again.`
          : '';
      setLastRunMessage(
        result.entries.length === 0
          ? `Nothing posted for ${periodEnd}${blockedNote || ' — every active asset was already current for this date.'}`
          : `Posted ${result.entries.length} depreciation charge${result.entries.length === 1 ? '' : 's'} across ${result.journalEntryIds.length} journal${result.journalEntryIds.length === 1 ? '' : 's'} through ${periodEnd}.${blockedNote}`,
      );
      closeDialog();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to run depreciation.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Depreciation"
        description="Bring every active asset current and review the posting history."
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

      <StatTileGrid
        columns={3}
        metrics={[
          { label: 'Active assets', value: String(activeAssets.length), hint: 'Eligible for depreciation', icon: LayersIcon },
          { label: 'Nominal monthly charge', value: formatCurrency(nominalMonthlyCharge), hint: 'One full month, straight to residual', icon: CoinsIcon },
          { label: 'Posted this month', value: formatCurrency(postedThisMonth), hint: currentMonthPrefix, icon: CalendarClockIcon },
        ]}
      />

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

      {runDialogOpen && (
        <FormShell open onClose={closeDialog} size="md" mode="edit" isDirty={dirty}>
          <FormHeader title="Run depreciation" />
          <RunDepreciationForm
            defaultPeriodEnd={endOfCurrentMonth()}
            onPreview={previewDepreciation}
            onSubmit={handleRun}
            onCancel={closeDialog}
            onDirtyChange={setDirty}
          />
        </FormShell>
      )}
    </div>
  );
}
