import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import type { ProvisionalTaxReconciliation } from '@/types/provisionalTax';
import { useProvisionalTax } from '../hooks/useProvisionalTax';
import { PaymentSlotCard } from '../components/PaymentSlotCard';
import { fieldInput, fieldLabel } from '../components/formStyles';

/** Provisional Tax — route `/tax/provisional-tax` (§54). */
export function ProvisionalTaxPage() {
  const {
    financialYears,
    periods,
    loading,
    error,
    refetch,
    getOrCreatePeriod,
    recordEstimate,
    payProvisionalTax,
    getReconciliation,
  } = useProvisionalTax();

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconciliation, setReconciliation] = useState<ProvisionalTaxReconciliation | undefined>(undefined);

  const sortedFinancialYears = useMemo(
    () => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)),
    [financialYears],
  );

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
    return <Spinner label="Loading provisional tax data…" />;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Provisional Tax</h1>
          <p className="mt-xs text-sm text-text-secondary">
            First, second, and voluntary top-up provisional tax payments, estimates, and reconciliation against the
            final Income Tax computation (§54). /tax/provisional-tax
          </p>
        </div>
        {sortedFinancialYears.length > 0 && (
          <div>
            <label className={fieldLabel} htmlFor="financialYearSelect">
              Financial Year
            </label>
            <select
              id="financialYearSelect"
              className={fieldInput}
              value={activeFinancialYearId ?? ''}
              onChange={(e) => setSelectedFinancialYearId(e.target.value)}
            >
              {sortedFinancialYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-danger bg-danger/10 px-md py-sm text-sm text-danger">
          {actionError}
        </p>
      )}
      {statusMessage && (
        <p role="status" className="rounded-md border border-border bg-positive/10 px-md py-sm text-sm text-positive">
          {statusMessage}
        </p>
      )}

      {sortedFinancialYears.length === 0 && (
        <EmptyState title="No financial years yet" message="A FinancialYear must exist before provisional tax can be tracked." />
      )}

      {selectedFinancialYear && !period && (
        <Card>
          <EmptyState
            title={`No provisional tax period yet for ${selectedFinancialYear.name}`}
            message="Create one to see the first, second, and top-up due dates for this financial year."
            action={
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await getOrCreatePeriod(selectedFinancialYear.id);
                  }, `Created a provisional tax period for ${selectedFinancialYear.name}.`)
                }
              >
                Create Provisional Tax Period
              </Button>
            }
          />
        </Card>
      )}

      {period && (
        <>
          <div className="grid grid-cols-1 gap-md md:grid-cols-3">
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

          <Card>
            <h2 className="mb-sm text-sm font-semibold text-text-primary">Reconciliation</h2>
            {reconciliation?.finalTaxLiability !== undefined ? (
              <div className="grid grid-cols-2 gap-md tabular-nums md:grid-cols-3">
                <div>
                  <p className="text-xs text-text-secondary">Total Paid</p>
                  <FinancialNumber value={reconciliation.totalPaid} format={formatCurrency} className="text-lg" />
                </div>
                <div>
                  <p className="text-xs text-text-secondary">Final Tax Liability</p>
                  <FinancialNumber value={reconciliation.finalTaxLiability} format={formatCurrency} isInverted className="text-lg" />
                </div>
                <div>
                  <p className="text-xs text-text-secondary">
                    {(reconciliation.variance ?? 0) >= 0 ? 'Still Owed' : 'Overpaid / Refund'}
                  </p>
                  <FinancialNumber value={reconciliation.variance ?? 0} format={formatCurrency} isInverted className="text-lg" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                Total paid so far:{' '}
                <FinancialNumber value={reconciliation?.totalPaid ?? 0} format={formatCurrency} className="text-sm" />. The
                reconciliation against the final tax liability appears once the Income Tax computation for this
                financial year is posted (see /tax/income-tax).
              </p>
            )}
            <p className="mt-sm text-xs text-text-secondary">
              Underpayment interest/penalties are not calculated here — SARS&apos;s provisional-tax underpayment
              interest rate floats with the prevailing repo rate rather than being a fixed statutory figure, so it
              requires the current SARS-published rate to compute (out of scope for this module — see §111
              professional review).
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
