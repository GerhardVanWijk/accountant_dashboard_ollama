import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { formatCurrency } from '@/utils/formatFinancial';
import { SYSTEM_USER_ID } from '@/features/accounting/services';
import { useIncomeTax } from '../hooks/useIncomeTax';
import { AdjustmentsTable } from '../components/AdjustmentsTable';
import { SbcEligibilityForm } from '../components/SbcEligibilityForm';
import { Modal } from '../components/Modal';
import { fieldInput, fieldLabel } from '../components/formStyles';

/** Income Tax — route `/tax/income-tax` (docs/ROUTES.md). */
export function IncomeTaxPage() {
  const {
    financialYears,
    company,
    computations,
    loading,
    error,
    refetch,
    createComputation,
    updateAdjustments,
    deleteComputation,
    postComputation,
    setSbcEligibility,
  } = useIncomeTax();

  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sbcModalOpen, setSbcModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sortedFinancialYears = useMemo(
    () => [...financialYears].sort((a, b) => b.endDate.localeCompare(a.endDate)),
    [financialYears],
  );

  const activeFinancialYearId = selectedFinancialYearId ?? sortedFinancialYears[0]?.id ?? null;
  const selectedFinancialYear = sortedFinancialYears.find((y) => y.id === activeFinancialYearId);
  const selectedComputation = computations.find((c) => c.financialYearId === activeFinancialYearId);

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
    return <Spinner label="Loading income tax data…" />;
  }
  if (error) {
    return <ErrorState message={error.message} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Income Tax</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Corporate income tax computation, SBC eligibility, and the accounting-profit-to-taxable-income
            reconciliation (§51/§52/§53). /tax/income-tax
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

      <Card>
        <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">SBC (Small Business Corporation) Eligibility</h2>
            <p className="mt-xs text-xs text-text-secondary">
              Manually confirmed by an accountant only — not auto-determined (§53). See{' '}
              {company?.isSbcEligible ? 'currently flagged eligible' : 'currently not flagged eligible'}
              {company?.sbcEligibilityReason ? `: "${company.sbcEligibilityReason}"` : '.'}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={() => setSbcModalOpen(true)}>
            {company?.isSbcEligible ? 'Change' : 'Flag as SBC-eligible'}
          </Button>
        </div>
      </Card>

      {sortedFinancialYears.length === 0 && (
        <EmptyState title="No financial years yet" message="A FinancialYear must exist before income tax can be computed." />
      )}

      {selectedFinancialYear && !selectedComputation && (
        <Card>
          <EmptyState
            title={`No tax computation yet for ${selectedFinancialYear.name}`}
            message="Create one to compute accounting profit, suggested tax adjustments, taxable income, and the resulting tax liability."
            action={
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await createComputation(selectedFinancialYear.id);
                  }, `Created a draft tax computation for ${selectedFinancialYear.name}.`)
                }
              >
                Create Tax Computation
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
                Tax year of assessment: {selectedComputation.taxConfigTaxYearLabel} ·{' '}
                {selectedComputation.isSbcEligible ? 'SBC brackets applied' : 'Standard corporate rate applied'}
              </span>
            </div>

            <div className="mt-md grid grid-cols-2 gap-md tabular-nums md:grid-cols-4">
              <div>
                <p className="text-xs text-text-secondary">Accounting Profit</p>
                <FinancialNumber value={selectedComputation.accountingProfit} format={formatCurrency} className="text-lg" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Net Adjustments</p>
                <FinancialNumber
                  value={selectedComputation.taxableIncome - selectedComputation.accountingProfit}
                  format={formatCurrency}
                  className="text-lg"
                />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Taxable Income</p>
                <FinancialNumber value={selectedComputation.taxableIncome} format={formatCurrency} className="text-lg" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Tax Liability</p>
                <FinancialNumber
                  value={selectedComputation.taxLiability}
                  format={formatCurrency}
                  isInverted
                  className="text-lg"
                />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-sm text-sm font-semibold text-text-primary">Tax Adjustments</h2>
            <AdjustmentsTable
              key={selectedComputation.id}
              adjustments={selectedComputation.adjustments}
              editable={selectedComputation.status === 'draft'}
              onSave={async (adjustments) => {
                await updateAdjustments(selectedComputation.id, adjustments);
                setStatusMessage('Adjustments saved and taxable income/tax liability recomputed.');
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
                  }, 'Draft tax computation deleted.')
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
                  }, `Posted income tax for ${selectedComputation.financialYearLabel}.`)
                }
              >
                Post Tax Computation
              </Button>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">
              Posted{selectedComputation.postedAt ? ` on ${new Date(selectedComputation.postedAt).toLocaleDateString()}` : ''}
              {selectedComputation.journalEntryId
                ? ` — journal entry ${selectedComputation.journalEntryId}.`
                : ' — no journal entry (nil tax liability).'}{' '}
              A posted computation is immutable; there is no reversal path yet.
            </p>
          )}
        </>
      )}

      {sbcModalOpen && (
        <Modal title="SBC Eligibility" onClose={() => setSbcModalOpen(false)}>
          <SbcEligibilityForm
            currentValue={company?.isSbcEligible ?? false}
            onCancel={() => setSbcModalOpen(false)}
            onSubmit={async (isEligible, reason) => {
              await runAction(async () => {
                await setSbcEligibility(isEligible, SYSTEM_USER_ID, reason);
              }, 'SBC eligibility updated.');
              setSbcModalOpen(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
