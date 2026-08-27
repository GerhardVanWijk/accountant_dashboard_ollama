import { useEffect, useMemo, useState } from 'react';
import { Loader2, CalendarClock } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Button } from '@/components/ui/shadcn/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/shadcn/empty';
import { formatCurrency } from '@/lib/app/format';
import type { ProvisionalTaxReconciliation } from '@/types/provisionalTax';
import { useProvisionalTax } from '../hooks/useProvisionalTax';
import { PaymentSlotCard } from '../components/PaymentSlotCard';

const selectClassName = 'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** Provisional Tax — route `/tax/provisional-tax`. Re-skinned onto v0's PageHeader/SectionCard (M7); data/mutation wiring unchanged. */
export function ProvisionalTaxPage() {
  const { financialYears, periods, loading, error, refetch, getOrCreatePeriod, recordEstimate, payProvisionalTax, getReconciliation } = useProvisionalTax();

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconciliation, setReconciliation] = useState<ProvisionalTaxReconciliation | undefined>(undefined);

  const sortedFinancialYears = useMemo(() => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)), [financialYears]);

  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const selectedFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);
  const period = periods.find((p) => p.financialYearId === activeFinancialYearId);

  useEffect(() => {
    let cancelled = false;
    if (!activeFinancialYearId) {
      setReconciliation(undefined);
      return;
    }
    getReconciliation(activeFinancialYearId).then((result) => {
      if (!cancelled) setReconciliation(result);
    });
    return () => {
      cancelled = true;
    };
    // `period` is included so the reconciliation refreshes whenever a payment is recorded (periods refetch after every mutation).
  }, [activeFinancialYearId, period, getReconciliation]);

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    setActionError(null);
    setStatusMessage(null);
    setBusy(true);
    try {
      await action();
      if (successMessage) setStatusMessage(successMessage);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading provisional tax data…</span>
      </div>
    );
  }
  if (error) {
    return (
      <SectionCard>
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
        <Button variant="outline" className="mt-3" onClick={refetch}>
          Retry
        </Button>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Provisional Tax"
        description="First, second, and voluntary top-up provisional tax payments, estimates, and reconciliation against the final Income Tax computation."
        actions={
          sortedFinancialYears.length > 0 ? (
            <select aria-label="Financial Year" className={selectClassName} value={activeFinancialYearId ?? ''} onChange={(e) => setSelectedFinancialYearId(e.target.value)}>
              {sortedFinancialYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="rounded-lg border border-status-positive-outline bg-status-positive-surface px-4 py-2.5 text-sm text-status-positive">
          {statusMessage}
        </p>
      )}

      {sortedFinancialYears.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarClock />
            </EmptyMedia>
            <EmptyTitle>No financial years yet</EmptyTitle>
            <EmptyDescription>A FinancialYear must exist before provisional tax can be tracked.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {selectedFinancialYear && !period && (
        <SectionCard>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No provisional tax period yet for {selectedFinancialYear.name}</EmptyTitle>
              <EmptyDescription>Create one to see the first, second, and top-up due dates for this financial year.</EmptyDescription>
            </EmptyHeader>
            <Button
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await getOrCreatePeriod(selectedFinancialYear.id);
                }, `Created a provisional tax period for ${selectedFinancialYear.name}.`)
              }
            >
              Create Provisional Tax Period
            </Button>
          </Empty>
        </SectionCard>
      )}

      {period && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PaymentSlotCard
              title="First Payment"
              description="Due 6 months after the financial year start."
              slot={period.first}
              busy={busy}
              onSaveEstimate={(income) =>
                runAction(async () => {
                  await recordEstimate(period.id, 'first', income);
                }, 'First payment estimate saved.')
              }
              onPay={(amount, date) =>
                runAction(async () => {
                  await payProvisionalTax(period.id, 'first', amount, date);
                }, 'First provisional tax payment recorded.')
              }
            />
            <PaymentSlotCard
              title="Second Payment"
              description="Due on the financial year end date."
              slot={period.second}
              busy={busy}
              onSaveEstimate={(income) =>
                runAction(async () => {
                  await recordEstimate(period.id, 'second', income);
                }, 'Second payment estimate saved.')
              }
              onPay={(amount, date) =>
                runAction(async () => {
                  await payProvisionalTax(period.id, 'second', amount, date);
                }, 'Second provisional tax payment recorded.')
              }
            />
            <PaymentSlotCard
              title="Top-up Payment"
              description="Voluntary, due 6 months after the financial year end."
              slot={period.topUp}
              busy={busy}
              onSaveEstimate={(income) =>
                runAction(async () => {
                  await recordEstimate(period.id, 'topUp', income);
                }, 'Top-up payment estimate saved.')
              }
              onPay={(amount, date) =>
                runAction(async () => {
                  await payProvisionalTax(period.id, 'topUp', amount, date);
                }, 'Top-up provisional tax payment recorded.')
              }
            />
          </div>

          <SectionCard title="Reconciliation">
            {reconciliation?.finalTaxLiability !== undefined ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <FigureBlock label="Total Paid" value={formatCurrency(reconciliation.totalPaid)} />
                <FigureBlock label="Final Tax Liability" value={formatCurrency(reconciliation.finalTaxLiability)} tone="warning" />
                <FigureBlock
                  label={(reconciliation.variance ?? 0) >= 0 ? 'Still Owed' : 'Overpaid / Refund'}
                  value={formatCurrency(reconciliation.variance ?? 0)}
                  tone={(reconciliation.variance ?? 0) >= 0 ? 'warning' : 'positive'}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Total paid so far: {formatCurrency(reconciliation?.totalPaid ?? 0)}. The reconciliation against the final tax liability appears once the Income Tax computation for this
                financial year is posted (see /tax/income-tax).
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Underpayment interest/penalties are not calculated here — SARS&apos;s provisional-tax underpayment interest rate floats with the prevailing repo rate rather than being a
              fixed statutory figure, so it requires the current SARS-published rate to compute (out of scope for this module — pending professional review).
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
