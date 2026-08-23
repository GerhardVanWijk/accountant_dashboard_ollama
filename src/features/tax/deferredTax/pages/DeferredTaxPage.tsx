import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { useDeferredTax } from '../hooks/useDeferredTax';
import { TemporaryDifferencesTable } from '../components/TemporaryDifferencesTable';
import { findMostRecentPostedBefore } from '../services/deferredTaxCalculations';
import { fieldInput, fieldLabel } from '../components/formStyles';

/** Deferred Tax — route `/tax/deferred-tax` (docs/ROUTES.md). SA_ACCOUNTING_MASTER_SPEC.md §50, §116 Phase 12 "Advanced Accounting". */
export function DeferredTaxPage() {
  const { financialYears, company, computations, loading, error, refetch, createComputation, updateItems, deleteComputation, postComputation } =
    useDeferredTax();

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedFinancialYears = useMemo(() => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)), [financialYears]);

  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const selectedFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);
  const selectedComputation = computations.find((c) => c.financialYearId === activeFinancialYearId);

  const priorComputation =
    selectedComputation && company
      ? findMostRecentPostedBefore(computations, company.id, selectedComputation.asOfDate, selectedComputation.id)
      : undefined;
  const previewMovement = selectedComputation
    ? selectedComputation.netDeferredTaxLiability - (priorComputation?.netDeferredTaxLiability ?? 0)
    : 0;

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
    return <Spinner label="Loading deferred tax data…" />;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Deferred Tax</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Temporary differences, Deferred Tax Assets/Liabilities, and the period movement (§50). /tax/deferred-tax
          </p>
        </div>
        {sortedFinancialYears.length > 0 && (
          <div>
            <label className={fieldLabel} htmlFor="dtFinancialYearSelect">
              Financial Year
            </label>
            <select
              id="dtFinancialYearSelect"
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

      <p role="note" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial">
        Not calculated as accounting profit × tax rate — every figure below is a real temporary difference (carrying
        amount vs. tax base). A Deferred Tax Asset only counts once you confirm it&apos;s probable future taxable
        profit will be available to use it (§50) — that judgment is never made automatically. Requires
        professional/accounting review before relying on it for a statutory filing (§110/§111).
      </p>

      {sortedFinancialYears.length === 0 && (
        <EmptyState title="No financial years yet" message="A FinancialYear must exist before deferred tax can be computed." />
      )}

      {selectedFinancialYear && !selectedComputation && (
        <Card>
          <EmptyState
            title={`No deferred tax computation yet for ${selectedFinancialYear.name}`}
            message="Create one to pull in the Fixed Asset Tax Register's temporary differences and add any others (provisions, assessed losses)."
            action={
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await createComputation(selectedFinancialYear.id);
                  }, `Created a draft deferred tax computation for ${selectedFinancialYear.name}.`)
                }
              >
                Create Deferred Tax Computation
              </Button>
            }
          />
        </Card>
      )}

      {selectedComputation && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <h2 className="text-sm font-semibold text-text-primary">
                {selectedComputation.financialYearLabel} — {selectedComputation.status === 'draft' ? 'Draft' : 'Posted'}
              </h2>
              <span className="text-xs text-text-secondary">
                As of {selectedComputation.asOfDate.slice(0, 10)} · {selectedComputation.taxRatePercent}% rate ({selectedComputation.taxConfigTaxYearLabel})
              </span>
            </div>

            <div className="mt-md grid grid-cols-2 gap-md tabular-nums md:grid-cols-4">
              <div>
                <p className="text-xs text-text-secondary">Deferred Tax Liability</p>
                <FinancialNumber value={selectedComputation.totalDeferredTaxLiability} format={formatCurrency} className="text-lg" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Deferred Tax Asset</p>
                <FinancialNumber value={selectedComputation.totalDeferredTaxAsset} format={formatCurrency} className="text-lg" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Net Position</p>
                <FinancialNumber value={selectedComputation.netDeferredTaxLiability} format={formatCurrency} isInverted className="text-lg" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">
                  {selectedComputation.status === 'draft' ? 'Movement Preview' : 'Movement Posted'}
                </p>
                <FinancialNumber
                  value={selectedComputation.status === 'draft' ? previewMovement : (selectedComputation.movementAmount ?? 0)}
                  format={formatCurrency}
                  isInverted
                  className="text-lg"
                />
                <p className="mt-xs text-xs text-text-muted">
                  {priorComputation
                    ? `vs. ${priorComputation.financialYearLabel} (posted)`
                    : 'vs. R0.00 (first computation for this company)'}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-sm text-sm font-semibold text-text-primary">Temporary Differences</h2>
            <TemporaryDifferencesTable
              key={selectedComputation.id}
              items={selectedComputation.items}
              taxRatePercent={selectedComputation.taxRatePercent}
              editable={selectedComputation.status === 'draft'}
              onSave={async (items) => {
                await updateItems(selectedComputation.id, items);
                setStatusMessage('Temporary differences saved and the deferred tax position recomputed.');
              }}
            />
          </Card>

          {selectedComputation.status === 'draft' ? (
            <div className="flex justify-end gap-sm">
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await deleteComputation(selectedComputation.id);
                  }, 'Draft deferred tax computation deleted.')
                }
              >
                Delete Draft
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await postComputation(selectedComputation.id);
                  }, `Posted the deferred tax movement for ${selectedComputation.financialYearLabel}.`)
                }
              >
                Post Movement
              </Button>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">
              Posted{selectedComputation.postedAt ? ` on ${new Date(selectedComputation.postedAt).toLocaleDateString()}` : ''}
              {selectedComputation.journalEntryId
                ? ` — journal entry ${selectedComputation.journalEntryId}.`
                : ' — no journal entry (nil movement).'}{' '}
              A posted computation is immutable; there is no reversal path yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
