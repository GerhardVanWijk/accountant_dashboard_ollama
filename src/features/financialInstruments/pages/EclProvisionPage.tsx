import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { useEcl } from '../hooks/useEcl';
import { EclBucketTable } from '../components/EclBucketTable';
import { findMostRecentPostedEclBefore } from '../services/eclCalculations';
import { fieldInput, fieldLabel } from '../components/formStyles';

/** Expected Credit Losses — route `/tax/expected-credit-losses` (docs/ROUTES.md). SA_ACCOUNTING_MASTER_SPEC.md §46 (IFRS 9), §116 Phase 12 "Advanced Accounting". */
export function EclProvisionPage() {
  const { financialYears, company, computations, loading, error, refetch, createComputation, updateBuckets, deleteComputation, postComputation } =
    useEcl();

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
      ? findMostRecentPostedEclBefore(computations, company.id, selectedComputation.asOfDate, selectedComputation.id)
      : undefined;
  const previewMovement = selectedComputation
    ? selectedComputation.totalExpectedCreditLoss - (priorComputation?.totalExpectedCreditLoss ?? 0)
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
    return <Spinner label="Loading expected credit loss data…" />;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Expected Credit Losses</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Provision matrix on trade receivables and the period movement (§46, IFRS 9). /tax/expected-credit-losses
          </p>
        </div>
        {sortedFinancialYears.length > 0 && (
          <div>
            <label className={fieldLabel} htmlFor="eclFinancialYearSelect">
              Financial Year
            </label>
            <select
              id="eclFinancialYearSelect"
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
        Gross receivables per bucket come from the real Customer Aging Report. Loss rates per bucket are ALWAYS a
        manual entry — this system has no historical default-rate data to derive them from, and does not guess one.
        Requires professional/accounting review before relying on it for a statutory filing (§110/§111).
      </p>

      {sortedFinancialYears.length === 0 && (
        <EmptyState title="No financial years yet" message="A FinancialYear must exist before expected credit losses can be computed." />
      )}

      {selectedFinancialYear && !selectedComputation && (
        <Card>
          <EmptyState
            title={`No expected credit loss computation yet for ${selectedFinancialYear.name}`}
            message="Create one to pull in real receivable balances by aging bucket from the Customer Aging Report."
            action={
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await createComputation(selectedFinancialYear.id);
                  }, `Created a draft expected credit loss computation for ${selectedFinancialYear.name}.`)
                }
              >
                Create Computation
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
              <span className="text-xs text-text-secondary">As of {selectedComputation.asOfDate.slice(0, 10)}</span>
            </div>

            <div className="mt-md grid grid-cols-2 gap-md tabular-nums md:grid-cols-3">
              <div>
                <p className="text-xs text-text-secondary">Gross Receivables</p>
                <FinancialNumber value={selectedComputation.totalGrossReceivable} format={formatCurrency} className="text-lg" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Expected Credit Loss Provision</p>
                <FinancialNumber value={selectedComputation.totalExpectedCreditLoss} format={formatCurrency} isInverted className="text-lg" />
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
            <h2 className="mb-sm text-sm font-semibold text-text-primary">Provision Matrix</h2>
            <EclBucketTable
              key={selectedComputation.id}
              buckets={selectedComputation.buckets}
              editable={selectedComputation.status === 'draft'}
              onSave={async (buckets) => {
                await updateBuckets(selectedComputation.id, buckets);
                setStatusMessage('Loss rates saved and the provision recomputed.');
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
                  }, 'Draft expected credit loss computation deleted.')
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
                  }, `Posted the expected credit loss movement for ${selectedComputation.financialYearLabel}.`)
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
