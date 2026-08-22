import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTaxRegister } from '../hooks/useTaxRegister';
import { TaxRegisterTable } from '../components/TaxRegisterTable';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tax Register — route `/assets/tax-register` (docs/ROUTES.md). */
export function TaxRegisterPage() {
  const [asOfDate, setAsOfDate] = useState(today());
  const { rows, loading, error, refetch } = useTaxRegister(asOfDate);

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Tax Register</h1>
          <p className="mt-xs text-sm text-text-secondary">
            Accounting carrying value vs. SARS wear-and-tear tax written-down value, per asset. /assets/tax-register
          </p>
        </div>
        <label className="flex flex-col gap-xs text-sm">
          <span className="sr-only">As of date</span>
          <input
            type="date"
            aria-label="As of date"
            className="rounded-md border border-border bg-panel px-sm py-xs text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </label>
      </div>

      <p role="note" className="rounded-md border border-warning bg-warning/10 px-md py-sm text-sm text-warning-financial">
        Wear-and-tear rates are typical/indicative values, not independently verified against SARS Binding General
        Practice Note 7 for any specific asset — confirm with a tax practitioner before relying on the tax
        written-down values below. This register does not compute deferred tax (SA_ACCOUNTING_MASTER_SPEC.md §116
        Phase 12).
      </p>

      {loading && <Spinner label="Computing the tax register…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && (
        <Card>
          {rows.length === 0 ? (
            <EmptyState title="No capitalized assets yet" message="Capitalize an asset on the Asset Register to see it here." />
          ) : (
            <TaxRegisterTable rows={rows} />
          )}
        </Card>
      )}
    </div>
  );
}
