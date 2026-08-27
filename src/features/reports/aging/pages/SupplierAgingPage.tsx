import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { FigureBlock } from '@/components/app/figure';
import { Field, FieldLabel } from '@/components/ui/shadcn/field';
import { Input } from '@/components/ui/shadcn/input';
import { Checkbox } from '@/components/ui/shadcn/checkbox';
import { Button } from '@/components/ui/shadcn/button';
import { formatCurrency } from '@/lib/app/format';
import { useSupplierAgingReport } from '../hooks/useSupplierAgingReport';
import { AgingReportTable } from '../components/AgingReportTable';
import { filterZeroBalance, sortByTotalDescending, sumAgingBuckets } from '../utils/agingReportUtils';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { SupplierDetailSheet } from '@/features/suppliers/components/SupplierDetailSheet';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Supplier Aging Report ("Aged Payables Summary") — route
 * `/reports/supplier-aging`. One row per supplier with current/30/60/90+
 * buckets, largest payables first. Reuses the real per-supplier aging math
 * (suppliers' `calculateAging`, via `getSupplierAgingReport()`) — the same
 * engine `src/features/purchases/pages/VendorAgingPage.tsx` uses, except
 * this page additionally lists every supplier via
 * `supplierService.getSuppliers()` (with a "show only with balance"
 * toggle), not only those with a currently outstanding bill. Re-skinned
 * onto v0's PageHeader/SectionCard/FigureBlock (M9).
 */
export function SupplierAgingPage() {
  const navigate = useNavigate();
  const [asOfDate, setAsOfDate] = useState(today());
  const [showAll, setShowAll] = useState(false);
  const { rows, loading, error, refetch } = useSupplierAgingReport(asOfDate);
  const suppliersState = useSuppliers();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSupplierId = searchParams.get('record') ?? undefined;
  const detailOpen = Boolean(selectedSupplierId);
  function openSupplier(id: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('record', id);
      return next;
    });
  }
  function closeSupplier() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('record');
      return next;
    });
  }

  const visibleRows = useMemo(() => sortByTotalDescending(filterZeroBalance(rows, showAll)), [rows, showAll]);
  const withBalanceCount = useMemo(() => rows.filter((row) => row.buckets.total > 0).length, [rows]);
  const totals = useMemo(() => sumAgingBuckets(visibleRows), [visibleRows]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Supplier aging"
        description="Aged Payables Summary — every supplier's outstanding balance by age bucket, largest payables first."
        actions={
          <Field className="w-40">
            <FieldLabel htmlFor="supplierAgingAsOfDate">As of date</FieldLabel>
            <Input id="supplierAgingAsOfDate" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </Field>
        }
      />

      <SectionCard>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FigureBlock label="Suppliers with balance" value={String(withBalanceCount)} />
          <FigureBlock label="Total payable" value={formatCurrency(totals.total)} />
          <FigureBlock label="Current" value={formatCurrency(totals.current)} />
          <FigureBlock label="90+ days overdue" value={formatCurrency(totals.days90Plus)} tone={totals.days90Plus > 0 ? 'negative' : 'default'} />
        </div>
      </SectionCard>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={showAll} onCheckedChange={(value) => setShowAll(value === true)} />
        Show suppliers with a zero balance
      </label>

      {loading && (
        <div role="status" className="flex min-h-[30vh] items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <p className="text-sm">Computing supplier aging…</p>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && (
        <SectionCard>
          <AgingReportTable
            rows={visibleRows}
            entityLabel="Supplier"
            emptyTitle={showAll ? 'No suppliers yet' : 'No outstanding supplier balances'}
            emptyMessage={showAll ? 'Add a supplier to see them listed here.' : 'Every supplier is fully paid as of this date — tick "Show suppliers with a zero balance" to see them anyway.'}
            onSelect={openSupplier}
          />
        </SectionCard>
      )}

      <SupplierDetailSheet
        supplierId={selectedSupplierId}
        suppliersState={suppliersState}
        open={detailOpen}
        onOpenChange={(next) => {
          if (!next) closeSupplier();
        }}
        onEdit={() => selectedSupplierId && navigate(`/purchases/vendors?view=edit&id=${selectedSupplierId}`)}
      />
    </div>
  );
}
