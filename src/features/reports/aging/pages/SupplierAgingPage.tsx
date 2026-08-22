import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { FinancialNumber } from '@/components/ui/FinancialNumber';
import { Spinner } from '@/components/feedback/Spinner';
import { ErrorState } from '@/components/feedback/ErrorState';
import { formatCurrency } from '@/utils/formatFinancial';
import { useSupplierAgingReport } from '../hooks/useSupplierAgingReport';
import { AgingReportTable } from '../components/AgingReportTable';
import { filterZeroBalance, sortByTotalDescending, sumAgingBuckets } from '../utils/agingReportUtils';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Supplier Aging Report — "Aged Payables Summary": one row per supplier
 * with current/30/60/90+ buckets side by side, largest payables first.
 *
 * Per-supplier/per-bill aging math already exists on each Supplier's own
 * Detail page and in the Dashboard's fleet-wide aggregate — this page is
 * the missing single-screen list view every supplier at once, reusing that
 * existing math (suppliers' `calculateAging`) rather than reimplementing
 * it. Note: `src/features/purchases/pages/VendorAgingPage.tsx` already
 * offers a similar report driven directly off real Bill data, but only
 * lists suppliers that currently have an outstanding bill — this page
 * additionally lists every supplier via `supplierService.getSuppliers()`
 * (with a "show only with balance" toggle), the way a real Aged Payables
 * Summary lets you also confirm which suppliers have nothing outstanding.
 *
 * Not built here (explicitly out of scope): per-supplier statement
 * printing, drill-down into individual open bills from a row (see the
 * Supplier Detail page for that), YoY/comparative aging, export/PDF/CSV,
 * credit-limit exception flagging (see Supplier Detail's `onHold`/
 * `creditLimit`).
 */
export function SupplierAgingPage() {
  const [asOfDate, setAsOfDate] = useState(today());
  const [showAll, setShowAll] = useState(false);
  const { rows, loading, error, refetch } = useSupplierAgingReport(asOfDate);

  const visibleRows = useMemo(() => sortByTotalDescending(filterZeroBalance(rows, showAll)), [rows, showAll]);
  const withBalanceCount = useMemo(() => rows.filter((row) => row.buckets.total > 0).length, [rows]);
  const totals = useMemo(() => sumAgingBuckets(visibleRows), [visibleRows]);

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-sm">
          <Icon name="suppliers" size={22} className="text-text-secondary" />
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Supplier Aging</h1>
            <p className="mt-xs text-sm text-text-secondary">
              Aged Payables Summary — every supplier's outstanding balance by age bucket, largest payables first.
            </p>
          </div>
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

      <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
        <Card>
          <div className="text-xs text-text-secondary">Suppliers with Balance</div>
          <div className="mt-xs text-2xl font-semibold tabular-nums text-text-primary">{withBalanceCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-text-secondary">Total Payable</div>
          <FinancialNumber value={totals.total} format={formatCurrency} className="mt-xs text-2xl font-semibold" showFlash={false} />
        </Card>
        <Card>
          <div className="text-xs text-text-secondary">Current</div>
          <FinancialNumber value={totals.current} format={formatCurrency} className="mt-xs text-2xl font-semibold" showFlash={false} />
        </Card>
        <Card>
          <div className="text-xs text-text-secondary">90+ Days Overdue</div>
          <FinancialNumber
            value={totals.days90Plus}
            format={formatCurrency}
            className="mt-xs text-2xl font-semibold text-negative"
            showFlash={false}
          />
        </Card>
      </div>

      <label className="flex items-center gap-sm text-sm text-text-secondary">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
        />
        Show suppliers with a zero balance
      </label>

      {loading && <Spinner label="Computing supplier aging…" />}
      {!loading && error && <ErrorState message={error.message} onRetry={refetch} />}

      {!loading && !error && (
        <AgingReportTable
          rows={visibleRows}
          entityLabel="Supplier"
          emptyTitle={showAll ? 'No suppliers yet' : 'No outstanding supplier balances'}
          emptyMessage={
            showAll
              ? 'Add a supplier to see them listed here.'
              : 'Every supplier is fully paid as of this date — tick "Show suppliers with a zero balance" to see them anyway.'
          }
        />
      )}
    </div>
  );
}
