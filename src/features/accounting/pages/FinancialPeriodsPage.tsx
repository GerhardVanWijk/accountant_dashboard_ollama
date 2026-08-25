import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AccountingPeriod, ID } from '@/types';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { StatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/shadcn/button';
import { formatDate } from '@/lib/app/format';
import { useAccountingPeriods } from '../hooks/useAccountingPeriods';
import { useFinancialYears } from '../hooks/useFinancialYears';
import { FinancialPeriodCard } from '../components/FinancialPeriodCard';
import { ReopenPeriodDialog } from '../components/ReopenPeriodDialog';
import { findPeriodForDate } from '../utils/periodLookup';
import { SYSTEM_USER_ID } from '../services';

/**
 * Financial Periods — route `/financial-periods` (docs/ROUTES.md). First
 * real UI onto AccountingPeriodService/FinancialYearService — no prior
 * page existed (nav carried `comingSoon: true`). The real domain is
 * two-level (a FinancialYear containing several AccountingPeriods, each
 * independently open/soft_closed/closed/locked); v0's mock data is a flat
 * list of 12 periods with a synthetic "current" status. Adapted to the
 * real domain rather than the other way around: a FinancialYear summary
 * card, then its periods below, with "current" derived from the existing
 * findPeriodForDate() lookup instead of a stored field — see the M3
 * report. Every close/lock/reopen action calls
 * AccountingPeriodService/FinancialYearService directly; there is no
 * create-year or create-period action because those services don't expose
 * one.
 */
export function FinancialPeriodsPage() {
  const { financialYears, loading: yearsLoading, error: yearsError, refetch: refetchYears, closeFinancialYear } =
    useFinancialYears();
  const { periods, loading: periodsLoading, error: periodsError, refetch: refetchPeriods, closePeriod, lockPeriod, reopenPeriod } =
    useAccountingPeriods();

  const [busyPeriodId, setBusyPeriodId] = useState<ID | null>(null);
  const [yearBusy, setYearBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<AccountingPeriod | null>(null);

  const todayISO = useMemo(() => new Date().toISOString(), []);

  const activeYear = useMemo(() => {
    if (financialYears.length === 0) return undefined;
    const open = financialYears.find((y) => y.status === 'open');
    return open ?? [...financialYears].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  }, [financialYears]);

  const yearPeriods = useMemo(
    () => periods.filter((p) => p.financialYearId === activeYear?.id).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [periods, activeYear],
  );

  const currentPeriod = useMemo(() => findPeriodForDate(yearPeriods, todayISO), [yearPeriods, todayISO]);

  const counts = yearPeriods.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const loading = yearsLoading || periodsLoading;
  const error = yearsError ?? periodsError;

  async function runPeriodAction(period: AccountingPeriod, action: () => Promise<unknown>): Promise<void> {
    setActionError(null);
    setBusyPeriodId(period.id);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update period.');
    } finally {
      setBusyPeriodId(null);
    }
  }

  async function handleCloseFinancialYear(): Promise<void> {
    if (!activeYear) return;
    setActionError(null);
    setYearBusy(true);
    try {
      await closeFinancialYear(activeYear.id, SYSTEM_USER_ID);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not close financial year.');
    } finally {
      setYearBusy(false);
    }
  }

  function refetch(): void {
    void refetchYears();
    void refetchPeriods();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Financial periods"
        description={
          activeYear
            ? `The accounting periods that make up ${activeYear.name}. Closing a period stops further postings against it; locking it prevents a reopen without a recorded reason.`
            : 'Open, closed and locked accounting periods for the active financial year.'
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {loading && (
        <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Loading financial periods…</p>
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={refetch}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && !activeYear && (
        <SectionCard>
          <p className="py-8 text-center text-sm text-muted-foreground">No financial year has been set up yet.</p>
        </SectionCard>
      )}

      {!loading && !error && activeYear && (
        <>
          <SectionCard
            title={activeYear.name}
            description={`${formatDate(activeYear.startDate)} – ${formatDate(activeYear.endDate)}`}
            actions={
              activeYear.status === 'open' ? (
                <Button variant="outline" size="sm" disabled={yearBusy} onClick={handleCloseFinancialYear}>
                  {yearBusy ? 'Closing…' : 'Close financial year'}
                </Button>
              ) : (
                <StatusBadge status={activeYear.status} />
              )
            }
          >
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <FigureBlock
                label="Current period"
                value={currentPeriod?.name ?? '—'}
                hint={currentPeriod ? `Closes ${formatDate(currentPeriod.endDate)}` : 'No period covers today'}
              />
              <FigureBlock label="Open" value={String(counts.open ?? 0)} hint="Still accepting postings" />
              <FigureBlock label="Closed" value={String(counts.closed ?? 0)} hint="Reconciled and signed off" />
              <FigureBlock label="Locked" value={String(counts.locked ?? 0)} hint="Sealed against reopening" />
            </div>
          </SectionCard>

          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {yearPeriods.map((period) => (
              <FinancialPeriodCard
                key={period.id}
                period={period}
                isCurrent={currentPeriod?.id === period.id}
                busy={busyPeriodId === period.id}
                onClose={() => void runPeriodAction(period, () => closePeriod(period.id, SYSTEM_USER_ID))}
                onLock={() => void runPeriodAction(period, () => lockPeriod(period.id, SYSTEM_USER_ID))}
                onReopen={() => setReopenTarget(period)}
              />
            ))}
          </ol>
        </>
      )}

      {reopenTarget && (
        <ReopenPeriodDialog
          periodName={reopenTarget.name}
          onClose={() => setReopenTarget(null)}
          onConfirm={async (reason) => {
            // Deliberately not routed through runPeriodAction: that helper
            // swallows the error into page-level state, but this dialog
            // needs the rejection to propagate so it stays open and shows
            // the error inline instead of closing silently on failure.
            setBusyPeriodId(reopenTarget.id);
            try {
              await reopenPeriod(reopenTarget.id, SYSTEM_USER_ID, reason);
              setReopenTarget(null);
            } finally {
              setBusyPeriodId(null);
            }
          }}
        />
      )}
    </div>
  );
}
